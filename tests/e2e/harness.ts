import { chromium, expect, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { cp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BenchmarkCase } from '../fixtures/cases';

// The repository may carry a local, git-ignored preset provider (preset-llm.json)
// that scripts/build.mjs copies into dist/ and wires as a required host permission.
// These specs exercise the manual BYO-key setup flow, so they load a throwaway copy
// of dist with that preset stripped; the real dist/ is never modified.
let extensionDir: Promise<string> | undefined;
function preparedExtension(): Promise<string> {
  extensionDir ??= (async () => {
    const dir = resolve('test-results', 'e2e-extension');
    await rm(dir, { recursive: true, force: true });
    await cp('dist', dir, { recursive: true });
    const presetPath = resolve(dir, 'preset-llm.json');
    try { await stat(presetPath); } catch { return dir; }
    await rm(presetPath);
    const manifestPath = resolve(dir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    delete manifest.host_permissions;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return dir;
  })();
  return extensionDir;
}

// Side panels are real extension targets, but are not Playwright tab Pages.
// Attach a separate CDP session without changing the shipped manifest or code.
export class Panel {
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private listener: (event: any) => void;
  onEvent?: (method: string, params: any) => void;
  constructor(private cdp: CDPSession, private sessionId: string) {
    this.listener = event => {
      if (event.sessionId !== sessionId) return;
      const data = JSON.parse(event.message);
      if (!data.id) { this.onEvent?.(data.method, data.params); return; }
      const pending = this.pending.get(data.id); this.pending.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error.message)); else pending?.resolve(data.result);
    };
    cdp.on('Target.receivedMessageFromTarget', this.listener);
  }
  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    await this.cdp.send('Target.sendMessageToTarget', { sessionId: this.sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  }
  async evaluate<T>(fn: (...args: any[]) => T | Promise<T>, ...args: any[]): Promise<T> {
    const result = await this.send('Runtime.evaluate', { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Panel evaluation failed.');
    return result.result.value;
  }
  async text() { return this.evaluate(() => document.body.innerText); }
  async click(text: string) {
    await this.evaluate((text: string) => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === text || button.getAttribute('aria-label') === text);
      if (!button || button.disabled) throw new Error(`Button unavailable: ${text}`);
      button.click();
    }, text);
  }
  async enter(selector: string, value: string) {
    await this.evaluate((selector: string, value: string) => {
      const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector, value);
  }
  async toggle(selector: string) {
    await this.evaluate((selector: string) => {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`Toggle unavailable: ${selector}`);
      input.click();
    }, selector);
  }
  async upload(file: string) {
    const { root } = await this.send('DOM.getDocument');
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    await this.send('DOM.setFileInputFiles', { nodeId, files: [resolve(file)] });
  }
  dispose() { this.cdp.off('Target.receivedMessageFromTarget', this.listener); }
}
export async function openExtension(info: TestInfo, framework = 'react', scenario = 'case-01') {
  // chrome.i18n follows the browser UI language, and this harness matches English
  // labels. Playwright's `locale` option only drives navigator.language and
  // Accept-Language, so the UI language has to be passed as a launch flag too.
  const { channel, locale } = info.project.use;
  const context = await chromium.launchPersistentContext(info.outputPath('profile'), {
    channel: channel ?? 'chromium', headless: false, locale,
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging', `--lang=${locale ?? 'en-US'}`],
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: await preparedExtension() });
  const worker = context.serviceWorkers().find(worker => worker.url().includes(id)) ?? await context.waitForEvent('serviceworker', { predicate: worker => worker.url().includes(id), timeout: 15_000 });
  await expect.poll(() => worker.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick === false && chrome.action.onClicked.hasListeners())).toBe(true);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4173/?framework=${framework}&case=${scenario}`);
  await page.locator('input[name="fullName"]').waitFor();
  // Toolbar-icon click: grants activeTab for that tab and opens the panel.
  // The panel only learns about a grant through the ACTION_GRANTED broadcast,
  // so tests must always go through this path. Defaults to the fixture tab.
  // Tabs sharing a URL (grant-on-second-tab tests) are told apart by document
  // title, which the tab target list exposes; give the extra tab a marker.
  async function trigger(target: Page = page) {
    await target.bringToFront();
    const title = await target.title();
    let targetId = '';
    await expect.poll(async () => {
      const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
      const matches = targetInfos.filter(info => info.url === target.url());
      const tab = matches.find(info => info.title === title) ?? (matches.length === 1 ? matches[0] : undefined);
      targetId = tab?.targetId ?? '';
      return !!targetId;
    }).toBe(true);
    void cdp.send('Extensions.triggerAction', { id, targetId }).catch(() => {});
  }
  await trigger();
  const panel = await attachPanel(cdp, id);
  return { context, cdp, id, worker, page, panel, trigger, close: async () => { panel.dispose(); await context.close(); } };
}
// The workflow UI is gated behind provider setup. Grant only the declared optional
// provider host in the disposable profile, then enable the provider through the real
// sidebar controls; application permission checks remain real.
export async function enableProvider(app: { context: BrowserContext; id: string; page: Page; panel: Panel }, extensionsUrl: string) {
  const manager = await app.context.newPage();
  await manager.goto(extensionsUrl);
  await manager.evaluate(async id => {
    await (chrome as any).developerPrivate.addHostPermission(id, 'https://api.openai.com/*');
  }, app.id);
  await manager.close(); await app.page.bringToFront();
  // Saving now runs a live verification probe (GET /v1/models). Intercept just that
  // call so the disposable profile never touches the network, then tear the stub down
  // so each test can install its own interception afterwards.
  await app.panel.send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.openai.com/v1/models*', requestStage: 'Request' }] });
  app.panel.onEvent = (method, event) => {
    if (method !== 'Fetch.requestPaused') return;
    void app.panel.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ object: 'list', data: [{ id: 'test-model', object: 'model' }] })).toString('base64') });
  };
  await app.panel.enter('input[placeholder="Model ID from your provider account"]', 'test-model');
  await app.panel.enter('input[type=password]', 'synthetic-e2e-key');
  await app.panel.click('Save & verify key');
  // The settings card hides once the provider is verified and the workflow unlocks.
  await expect.poll(() => app.panel.text()).toContain('1 Document');
  await app.panel.send('Fetch.disable');
  app.panel.onEvent = undefined;
  // The workflow page is now always available (single-page flow); the drop
  // zone heading is its stable marker once the provider is enabled.
  await expect.poll(() => app.panel.text()).toContain('Start with your documents');
}
export async function attachPanel(cdp: CDPSession, id: string): Promise<Panel> {
  let targetId = '';
  await expect.poll(async () => {
    const targets = await cdp.send('Target.getTargets', { filter: [{}] });
    targetId = targets.targetInfos.find(target => target.type === 'page' && target.url === `chrome-extension://${id}/sidepanel/index.html`)?.targetId ?? '';
    return !!targetId;
  }).toBe(true);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  const panel = new Panel(cdp, sessionId);
  await panel.send('Runtime.enable'); await panel.send('DOM.enable');
  await expect.poll(() => panel.text()).toContain('Your document. The right fields.');
  return panel;
}
// Synthetic oracle: answer the panel's mapping request from the fixture's
// expected values instead of contacting a provider. `hold` leaves the request
// paused and exposes `counts.release` so a test can assert the in-flight UI.
export function installMappingMock(app: { panel: Panel }, scenario: BenchmarkCase, counts: { requests: number; error: string; release?: () => void }, hold = false) {
  app.panel.onEvent = (method: string, event: any) => {
    if (method !== 'Fetch.requestPaused') return;
    void (async () => {
      counts.requests++;
      expect(event.request.url).toBe('https://api.openai.com/v1/chat/completions');
      const request = JSON.parse(event.request.postData);
      const payload = JSON.parse(request.messages[1].content);
      expect(payload.formFields.every((field: any) => !('currentValue' in field))).toBe(true);
      expect(JSON.stringify(payload)).not.toContain('synthetic-e2e-key');
      const assignments = payload.formFields.map((field: any) => {
        const expected = scenario.fields.find(item => item.name === field.name)!.expected!;
        const line = payload.documentLines.find((line: any) => line.text.includes(expected));
        if (!line) throw new Error('Fixture evidence was not present in PDF extraction.');
        return { fieldId: field.id, value: expected, evidence: [{ lineId: line.id, quote: expected }], reason: 'Synthetic oracle; not an LLM accuracy measurement.' };
      });
      counts.release = () => void app.panel.send('Fetch.fulfillRequest', {
        requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ assignments, unmapped: [] }) } }] })).toString('base64'),
      });
      if (!hold) counts.release();
    })().catch(error => { counts.error = String(error); void app.panel.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }); });
  };
}
