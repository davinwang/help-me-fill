import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openExtension, enableProvider, installMappingMock } from './harness';
import { benchmarkCases } from '../fixtures/cases';

for (const framework of ['native', 'react', 'vue']) {
  test(`${framework}: parallel detection, review switches, and conditional undo`, async ({}, info) => {
    const scenario = benchmarkCases[framework === 'vue' ? 1 : 0];
    const app = await openExtension(info, framework, scenario.id);
    try {
      const counts = { requests: 0, error: '' } as { requests: number; error: string; release?: () => void };
      await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
      expect(counts.requests).toBe(0);
      // Detection runs in parallel with document selection: fillable fields and
      // their current page values appear before any document exists.
      await expect.poll(() => app.panel.text()).toContain('10 fillable fields detected');
      await expect.poll(() => app.panel.text()).toContain('Fields detected — add a document so AI can match them.');
      expect(await app.panel.evaluate(() => !!document.querySelector('.attention .drop-zone'))).toBe(true);
      expect(await app.panel.evaluate(() => [...document.querySelectorAll('.field-list li')].map(item => item.querySelector('.section-top strong')?.textContent)))
        .toEqual(scenario.fields.map(field => field.label));
      expect(await app.panel.text()).not.toContain('Matches are suggestions');
      await app.panel.upload(`tests/fixtures/generated/${scenario.id}.pdf`);
      await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.pdf`);
      // A cloud provider starts manual: the disclosure card appears by itself,
      // nothing leaves the browser, and the page is untouched.
      await expect.poll(() => app.panel.text()).toContain('Review what you share');
      expect(counts.requests).toBe(0);
      expect(await app.page.locator('input[name="fullName"]').inputValue()).toBe('');
      // The single page keeps document access available while reviewing.
      expect(await app.panel.evaluate(() => document.querySelectorAll('.drop-zone, .doc-card').length)).toBe(2);
      await app.panel.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] });
      installMappingMock(app, scenario, counts);
      await app.panel.click('Send to OpenAI and generate suggestions');
      await expect.poll(() => app.panel.text()).toContain('Matches are suggestions');
      expect(counts.error).toBe(''); expect(counts.requests).toBe(1);
      // Empty page fields are armed by default; the page keeps its values.
      const switches = () => app.panel.evaluate(() => [...document.querySelectorAll('.field-list input.switch')].map(input => (input as HTMLInputElement).checked));
      expect(await switches()).toEqual(Array(10).fill(true));
      expect(await app.panel.evaluate(() => (document.querySelector('.check-label.master input') as HTMLInputElement).checked)).toBe(true);
      const disabled = (text: string) => app.panel.evaluate((text: string) =>
        [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === text)?.disabled, text);
      expect(await disabled('AI help me fill (10)')).toBe(false);
      // One switch off falls back to the page value and drops the count.
      await app.panel.toggle('.field-list input.switch');
      expect(await switches()).toEqual([false, ...Array(9).fill(true)]);
      expect(await disabled('AI help me fill (9)')).toBe(false);
      // A row switched off falls back to the page value, exactly like an
      // unmatched field: the same plain value line, here empty.
      await expect.poll(() => app.panel.text()).toContain('(no value yet)');
      await app.panel.toggle('.field-list input.switch');
      expect(await disabled('AI help me fill (10)')).toBe(false);
      // The tri-state master switch flips every row off, then back on.
      await app.panel.toggle('.check-label.master input');
      expect(await switches()).toEqual(Array(10).fill(false));
      expect(await disabled('AI help me fill (0)')).toBe(true);
      await app.panel.toggle('.check-label.master input');
      expect(await switches()).toEqual(Array(10).fill(true));
      // A hand edit is marked as a manual override and is what gets written.
      await app.panel.enter('.field-list textarea', 'Hand edited name');
      await expect.poll(() => app.panel.text()).toContain('Manual override');
      await app.panel.click('AI help me fill (10)');
      await expect.poll(() => app.panel.text(), { timeout: 25_000 }).toContain('Operation results');
      expect(await app.panel.evaluate(() => [...document.querySelectorAll('.results .badge')].map(node => node.textContent))).toEqual(Array(10).fill('filled'));
      await app.page.locator('#rerender').click();
      await expect(app.page.locator('[name="fullName"]')).toHaveValue('Hand edited name');
      for (const field of scenario.fields.slice(1)) await expect(app.page.locator(`[name="${field.name}"]`)).toHaveValue(field.expected!);
      expect(JSON.parse(await app.page.locator('#state').innerText()).fullName).toBe('Hand edited name');
      await app.panel.click('Undo last fill');
      await expect.poll(() => app.panel.evaluate(() => document.querySelectorAll('.results .badge').length ? [...document.querySelectorAll('.results .badge')].filter(node => node.textContent === 'restored').length : 0), { timeout: 25_000 }).toBe(10);
      await expect.poll(() => disabled('Undo last fill')).toBe(true);
      await app.panel.click('AI help me fill (10)');
      await expect.poll(() => app.panel.evaluate(() => [...document.querySelectorAll('.results .badge')].filter(node => node.textContent === 'filled').length), { timeout: 25_000 }).toBe(10);
      expect(counts.error).toBe('');
      // A user edit after the repeated fill must survive undo.
      await app.page.locator('[name="fullName"]').fill('Later user edit');
      await app.panel.click('Undo last fill');
      await expect.poll(() => app.panel.evaluate(() => document.querySelectorAll('.results .badge').length ? [...document.querySelectorAll('.results .badge')].filter(node => node.textContent === 'restored').length : 0), { timeout: 25_000 }).toBe(9);
      await expect(app.page.locator('[name="fullName"]')).toHaveValue('Later user edit');
      await expect(app.page.locator('[name="email"]')).toHaveValue('');
      const persistent = await app.panel.evaluate(() => chrome.storage.local.get(null));
      expect(JSON.stringify(persistent)).not.toContain('synthetic-e2e-key');
      expect(JSON.stringify(persistent)).not.toContain(scenario.fields[0].expected!);
      const screenshot = await app.panel.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(info.outputPath('verified-workflow.png'), Buffer.from(screenshot.data, 'base64'));
      await info.attach('verified-workflow', { path: info.outputPath('verified-workflow.png'), contentType: 'image/png' });
    } finally { await app.close(); }
  });
}

test('auto-send asks first and then matches automatically', async ({}, info) => {
  const scenario = benchmarkCases[0];
  const app = await openExtension(info, 'react', scenario.id);
  try {
    const counts = { requests: 0, error: '' } as { requests: number; error: string; release?: () => void };
    await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
    await app.panel.upload(`tests/fixtures/generated/${scenario.id}.pdf`);
    await expect.poll(() => app.panel.text()).toContain('Review what you share');
    await app.panel.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] });
    installMappingMock(app, scenario, counts, true);
    // Turning auto-send on for a cloud provider warns first; declining keeps
    // the switch off and sends nothing.
    await app.panel.toggle('.consent input.switch');
    await expect.poll(() => app.panel.text()).toContain('Auto-send document text to OpenAI?');
    await app.panel.click('Cancel');
    await expect.poll(() => app.panel.text()).not.toContain('Auto-send document text to OpenAI?');
    expect(counts.requests).toBe(0);
    expect(await app.panel.evaluate(() => (document.querySelector('.consent input.switch') as HTMLInputElement).checked)).toBe(false);
    // "Send & always" confirms through the warning and matches on the spot.
    await app.panel.click('Send & always auto-send');
    await expect.poll(() => app.panel.text()).toContain('Auto-send document text to OpenAI?');
    await app.panel.click('Enable auto-send');
    await expect.poll(() => app.panel.text()).toContain('Auto-send is on for OpenAI');
    await expect.poll(() => counts.requests).toBe(1);
    expect(await app.page.locator('input[name="fullName"]').inputValue()).toBe('');
    counts.release!();
    await expect.poll(() => app.panel.text()).toContain('Matches are suggestions');
    expect(counts.error).toBe('');
    expect(await app.panel.evaluate(() => document.querySelectorAll('.field-list input.switch:checked').length)).toBe(10);
    const stored = await app.panel.evaluate(() => chrome.storage.local.get(null));
    expect((stored as Record<string, { provider?: string; value?: boolean }>).autoSend).toMatchObject({ provider: 'openai', value: true });
  } finally { await app.close(); }
});
