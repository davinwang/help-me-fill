import { chromium, expect, type BrowserContext, type CDPSession, type Page, type TestInfo } from '@playwright/test';
import { resolve } from 'node:path';

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
      const element = document.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector, value);
  }
  async upload(file: string) {
    const { root } = await this.send('DOM.getDocument');
    const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    await this.send('DOM.setFileInputFiles', { nodeId, files: [resolve(file)] });
  }
  dispose() { this.cdp.off('Target.receivedMessageFromTarget', this.listener); }
}
export async function openExtension(info: TestInfo, framework = 'react', scenario = 'case-01') {
  const context = await chromium.launchPersistentContext(info.outputPath('profile'), {
    channel: info.project.use.channel ?? 'chromium', headless: false,
    ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers().find(worker => worker.url().includes(id)) ?? await context.waitForEvent('serviceworker', { predicate: worker => worker.url().includes(id), timeout: 15_000 });
  await expect.poll(() => worker.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick === false && chrome.action.onClicked.hasListeners())).toBe(true);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4173/?framework=${framework}&case=${scenario}`);
  await page.locator('input[name="fullName"]').waitFor();
  async function trigger() {
    await page.bringToFront();
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab', exclude: false }] });
    const tab = targetInfos.find(target => target.url === page.url());
    if (!tab) throw new Error('Fixture tab target was not found.');
    void cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId }).catch(() => {});
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
  await app.panel.enter('input[placeholder="Model ID from your provider account"]', 'test-model');
  await app.panel.enter('input[type=password]', 'synthetic-e2e-key');
  await app.panel.click('Enable provider');
  // The settings card hides once the provider is enabled and the workflow unlocks.
  await expect.poll(() => app.panel.text()).toContain('1 Document');
  await expect.poll(() => app.panel.text()).toContain('AI help me fill');
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
