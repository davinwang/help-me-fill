import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openExtension, attachPanel, enableProvider } from './harness';
import { benchmarkCases } from '../fixtures/cases';
import { PROVIDERS } from '../../src/ai/registry';
import type { BoundScan } from '../../src/shared/schemas';

test('production sidebar parses a bilingual PDF and scans the real tab', async ({}, info) => {
  const app = await openExtension(info);
  try {
    // The workflow stays locked until a provider is configured.
    expect(await app.panel.text()).toContain('Configure a provider to start');
    expect(await app.panel.text()).not.toContain('AI help me fill');
    // The on-device option appears exactly when this browser exposes a reachable model.
    const support = await app.panel.evaluate(async () => {
      const api = (globalThis as any).LanguageModel ?? (globalThis as any).ai?.languageModel;
      if (!api) return '';
      const state = await api.availability();
      return ['available', 'downloadable', 'downloading'].includes(state) ? state : '';
    });
    await expect.poll(async () => (await app.panel.evaluate(() => [...document.querySelectorAll('select option')].map(option => (option as HTMLOptionElement).value))).includes('builtin')).toBe(!!support);
    console.log(`${info.project.name}: on-device model support: ${support || 'not offered on this browser/device'}`);
    if (support) {
      await app.panel.evaluate(() => { const select = document.querySelector('select') as HTMLSelectElement; select.value = 'builtin'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(await app.panel.evaluate(() => document.querySelectorAll('input[type=password]').length)).toBe(0);
      expect(await app.panel.text()).toContain('Enable on-device provider');
      await app.panel.evaluate(() => { const select = document.querySelector('select') as HTMLSelectElement; select.value = 'openai'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    }
    // Flash-class defaults are prefilled but editable, and each provider links to its key page.
    const providerShot = await app.panel.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(info.outputPath('provider-settings.png'), Buffer.from(providerShot.data, 'base64'));
    await info.attach('provider-settings', { path: info.outputPath('provider-settings.png'), contentType: 'image/png' });
    expect(await app.panel.evaluate(() => document.querySelector<HTMLInputElement>('input[placeholder="Model ID from your provider account"]')?.value)).toBe(PROVIDERS.openai.defaultModel);
    expect(await app.panel.evaluate((keyUrl: string) => document.querySelector(`a[href="${keyUrl}"]`)?.textContent ?? '', PROVIDERS.openai.keyUrl)).toContain('Get API key');
    await app.panel.enter('input[placeholder="Model ID from your provider account"]', 'zhipu-check');
    await app.panel.evaluate(() => { (document.querySelector('select') as HTMLSelectElement).value = 'zhipu'; document.querySelector('select')!.dispatchEvent(new Event('change', { bubbles: true })); });
    await expect.poll(() => app.panel.evaluate(() => document.querySelector<HTMLInputElement>('input[placeholder="Model ID from your provider account"]')?.value)).toBe(PROVIDERS.zhipu.defaultModel);
    await app.panel.evaluate(() => { (document.querySelector('select') as HTMLSelectElement).value = 'openai'; document.querySelector('select')!.dispatchEvent(new Event('change', { bubbles: true })); });
    await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
    // Once enabled, the settings card hides behind Edit LLM and the workflow shows.
    expect(await app.panel.text()).not.toContain('Enable provider');
    expect(await app.panel.text()).toContain('Edit LLM');
    await app.panel.upload('tests/fixtures/generated/case-02.pdf');
    await expect.poll(() => app.panel.text()).toContain('case-02.pdf');
    expect(await app.panel.evaluate(() => document.querySelector('.text-preview')?.textContent)).toContain('陈小明');
    await app.panel.click('AI help me fill');
    await expect.poll(() => app.panel.text()).toContain('Review what you share');
    expect(await app.page.locator('input[name="fullName"]').inputValue()).toBe('');
    const image = await app.panel.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(info.outputPath('sidebar.png'), Buffer.from(image.data, 'base64'));
    await info.attach('sidebar', { path: info.outputPath('sidebar.png'), contentType: 'image/png' });
    console.log(`${info.project.name}: ${app.context.browser()!.version()} · screenshot: ${info.outputPath('sidebar.png')}`);
  } finally { await app.close(); }
});

test('packaged PDF worker extracts every benchmark and rejects failure fixtures', async ({}, info) => {
  const app = await openExtension(info, 'native');
  try {
    await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
    const previews = () => app.panel.evaluate(() => [...document.querySelectorAll('.text-preview')].map(node => node.textContent ?? '').join('\n'));
    for (const scenario of benchmarkCases) {
      await app.panel.upload(`tests/fixtures/generated/${scenario.id}.pdf`);
      await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.pdf`);
      await expect.poll(async () => {
        const text = await previews();
        return scenario.fields.every(field => field.expected === null || text.includes(field.expected));
      }).toBe(true);
    }
    // Parsed documents accumulate as cards; failures must not add one.
    expect(await app.panel.evaluate(() => document.querySelectorAll('.doc-card').length)).toBe(benchmarkCases.length);
    for (const [file, error] of [
      ['no-text', 'No extractable text'], ['too-many-pages', 'at most 20 pages'],
      ['too-much-text', 'exceeds 24,000 characters'], ['corrupt', 'could not be read'],
      ['too-large', '10 MiB or smaller'], ['empty', 'file is empty'], ['wrong-header', 'valid PDF header'],
    ]) {
      await app.panel.upload(`tests/fixtures/generated/${file}.pdf`);
      await expect.poll(() => app.panel.text()).toContain(error);
      expect(await app.panel.evaluate(() => document.querySelectorAll('.doc-card').length)).toBe(benchmarkCases.length);
    }
    // Deleting a document removes its card; the rest stay parsed and available.
    await app.panel.click(`Remove ${benchmarkCases[0].id}.pdf`);
    await expect.poll(() => app.panel.evaluate(() => document.querySelectorAll('.doc-card').length)).toBe(benchmarkCases.length - 1);
    expect(await app.panel.text()).not.toContain(`${benchmarkCases[0].id}.pdf`);
    await app.panel.upload('tests/fixtures/generated/case-01.pdf');
    await expect.poll(() => app.panel.text()).toContain('case-01.pdf');
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
  } finally { await app.close(); }
});

test('word, excel, markdown, and text documents extract with provenance', async ({}, info) => {
  const app = await openExtension(info, 'native');
  try {
    await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
    const scenario = benchmarkCases[0];
    // Documents accumulate; inspect the preview of the most recently added card.
    const preview = () => app.panel.evaluate(() => { const all = document.querySelectorAll('.text-preview'); return all.length ? all[all.length - 1].textContent ?? '' : ''; });
    await app.panel.upload(`tests/fixtures/generated/${scenario.id}.docx`);
    await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.docx`);
    expect(await preview()).toContain(scenario.fields[0].expected!);
    await app.panel.upload(`tests/fixtures/generated/${scenario.id}.xlsx`);
    await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.xlsx`);
    const sheet = await preview();
    expect(sheet).toContain('[Sheet1] r1:');
    expect(sheet).toContain(scenario.fields[5].expected!); // leading-zero reference survives formatting
    await app.panel.upload(`tests/fixtures/generated/${scenario.id}.md`);
    await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.md`);
    expect(await preview()).toContain(scenario.fields[0].expected!);
    await app.panel.upload(`tests/fixtures/generated/${scenario.id}.txt`);
    await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.txt`);
    expect(await preview()).toContain(scenario.fields[0].expected!);
    expect(await app.panel.evaluate(() => document.querySelectorAll('.doc-card').length)).toBe(4);
    await app.panel.upload('tests/fixtures/generated/legacy.doc');
    await expect.poll(() => app.panel.text()).toContain('Legacy .doc and image-only scans are not supported');
    expect(await app.panel.evaluate(() => document.querySelectorAll('.doc-card').length)).toBe(4);
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
  } finally { await app.close(); }
});

test('reload and tab switches invalidate scans without retargeting', async ({}, info) => {
  const app = await openExtension(info, 'native');
  try {
    await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
    await app.panel.upload('tests/fixtures/generated/case-01.pdf');
    await expect.poll(() => app.panel.text()).toContain('case-01.pdf');
    await app.panel.click('AI help me fill');
    await expect.poll(() => app.panel.text()).toContain('Review what you share');
    await app.page.reload();
    await expect.poll(() => app.panel.text()).toContain('document or route changed');
    // Invalidation returns to Step 1; the parsed document survives.
    expect(await app.panel.text()).not.toContain('Review what you share');
    expect(await app.panel.text()).toContain('case-01.pdf');
    await app.trigger();
    await app.panel.click('AI help me fill');
    await expect.poll(() => app.panel.text()).toContain('Review what you share');
    const other = await app.context.newPage();
    await other.goto(app.page.url());
    await expect.poll(() => app.panel.text()).toContain('active tab changed');
    await app.panel.click('AI help me fill');
    await expect.poll(() => app.panel.text()).toContain('toolbar icon');
    expect(await app.panel.text()).not.toContain('Review what you share');
    await expect(other.locator('[name="fullName"]')).toHaveValue('');
    await other.close(); await app.trigger();
    await app.panel.click('AI help me fill');
    await expect.poll(() => app.panel.text()).toContain('Review what you share');
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
  } finally { await app.close(); }
});

// These calls come from the real sidebar, exercising production sender checks,
// document-targeted messaging, and live-port guards without involving any AI.
async function captureScan(app: Awaited<ReturnType<typeof openExtension>>): Promise<BoundScan> {
  return app.panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const injection = await chrome.scripting.executeScript({ target: { tabId: tab.id!, frameIds: [0] }, files: ['content/index.js'] });
    const target = { tabId: tab.id!, windowId: tab.windowId, url: tab.url!, documentId: injection[0].documentId! };
    const reply = await chrome.tabs.sendMessage(target.tabId, { type: 'SCAN', requestId: crypto.randomUUID(), expectedUrl: target.url }, { documentId: target.documentId });
    if (!reply.ok) throw new Error(reply.error);
    return { ...reply.data, target };
  });
}
async function tryFill(app: Awaited<ReturnType<typeof openExtension>>, scan: BoundScan, live: boolean, invalidId = false) {
  return app.panel.evaluate(async (scan: BoundScan, live: boolean, invalidId: boolean) => {
    const requestId = crypto.randomUUID();
    const port = live ? chrome.tabs.connect(scan.target.tabId, { documentId: scan.target.documentId, name: `help-me-fill:${requestId}` }) : undefined;
    try {
      if (port) await new Promise<void>(resolve => port.onMessage.addListener(() => resolve()));
      return await chrome.tabs.sendMessage(scan.target.tabId, {
        type: 'FILL', requestId, scanId: scan.scanId, expectedUrl: scan.url,
        assignments: [{ fieldId: invalidId ? 'excluded-control' : scan.fields[0].id, value: 'Synthetic write', expectedValue: scan.fields[0].currentValue, allowOverwrite: false }],
      }, { documentId: scan.target.documentId });
    } finally { port?.disconnect(); }
  }, scan, live, invalidId);
}

test('production executor refuses unconfirmed, invalid, stale, and overwritten targets', async ({}, info) => {
  const app = await openExtension(info, 'react');
  try {
    const scan = await captureScan(app);
    expect((await tryFill(app, scan, false)).ok).toBe(false);
    expect((await tryFill(app, scan, true, true)).ok).toBe(false);
    expect((await tryFill(app, { ...scan, scanId: 'stale-scan' }, true)).ok).toBe(false);
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
    await app.page.locator('[name="fullName"]').fill('Existing user value');
    expect((await tryFill(app, scan, true)).ok).toBe(false);
    const prefilled = await captureScan(app);
    expect((await tryFill(app, prefilled, true)).ok).toBe(false);
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('Existing user value');
    await app.page.locator('[name="fullName"]').fill('');
    const changed = await captureScan(app);
    await app.page.locator('[name="fullName"]').evaluate(element => element.setAttribute('aria-label', 'Different entity'));
    expect((await tryFill(app, changed, true)).ok).toBe(false);
    const replacement = await captureScan(app);
    await app.page.locator('[name="fullName"]').evaluate(element => element.replaceWith(element.cloneNode(true)));
    expect((await tryFill(app, replacement, true)).ok).toBe(false);
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
    await expect(app.page.locator('input[type="password"]')).toHaveValue('');
    await expect(app.page.locator('[autocomplete="cc-number"]')).toHaveValue('');
    const staleDocument = await captureScan(app);
    await app.page.reload();
    await expect(tryFill(app, staleDocument, false)).rejects.toThrow();
    await expect(app.page.locator('[name="fullName"]')).toHaveValue('');
  } finally { await app.close(); }
});

for (const interruption of ['cancel', 'tab switch', 'panel close']) {
  test(`${interruption} stops remaining production writes`, async ({}, info) => {
    const app = await openExtension(info, 'native');
    try {
      const scan = await captureScan(app);
      const operation = app.panel.evaluate(async (scan: BoundScan) => {
        const requestId = crypto.randomUUID();
        const port = chrome.tabs.connect(scan.target.tabId, { documentId: scan.target.documentId, name: `help-me-fill:${requestId}` });
        try {
          await new Promise<void>(resolve => port.onMessage.addListener(() => resolve()));
          return await chrome.tabs.sendMessage(scan.target.tabId, {
            type: 'FILL', requestId, scanId: scan.scanId, expectedUrl: scan.url,
            assignments: scan.fields.slice(0, 2).map((field, index) => ({ fieldId: field.id, value: index ? 'pending@example.test' : 'First write', expectedValue: '', allowOverwrite: false })),
          }, { documentId: scan.target.documentId });
        } finally { port.disconnect(); }
      }, scan).catch(() => null);
      await expect(app.page.locator('[name="fullName"]')).toHaveValue('First write');
      if (interruption === 'cancel') {
        await app.panel.evaluate(async (scan: BoundScan) => {
          await chrome.tabs.sendMessage(scan.target.tabId, { type: 'CANCEL', requestId: crypto.randomUUID() }, { documentId: scan.target.documentId });
        }, scan);
      } else if (interruption === 'tab switch') {
        await app.context.newPage();
      } else {
        await app.worker.evaluate(async windowId => { await (chrome.sidePanel as any).close({ windowId }); }, scan.target.windowId);
      }
      if (interruption !== 'panel close') {
        const result = await operation;
        expect(result.ok).toBe(true);
        expect(result.data.results.map((item: any) => item.status)).toEqual(['filled', 'failed']);
      } else {
        // Observe beyond the executor's one-second persistence window before reopening.
        await app.page.waitForTimeout(1_500);
        await app.trigger();
        const reopened = await attachPanel(app.cdp, app.id);
        expect(await reopened.text()).not.toContain('Review suggestions');
        expect(await reopened.text()).not.toContain('supported fields found');
        reopened.dispose();
      }
      await expect(app.page.locator('[name="email"]')).toHaveValue('');
      await expect(app.page.locator('[name="fullName"]')).toHaveValue('First write');
    } finally { await app.close(); }
  });
}
