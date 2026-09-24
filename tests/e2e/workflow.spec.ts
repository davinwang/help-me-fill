import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openExtension, enableProvider } from './harness';
import { benchmarkCases } from '../fixtures/cases';

for (const framework of ['native', 'react', 'vue']) {
  test(`${framework}: consent, grounded proposals, persistent fill, and conditional undo`, async ({}, info) => {
    const scenario = benchmarkCases[framework === 'vue' ? 1 : 0];
    const app = await openExtension(info, framework, scenario.id);
    try {
      let requests = 0, mockError = '';
      await enableProvider(app, info.project.name === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
      expect(requests).toBe(0);
      // The save-time verification probe is intercepted inside enableProvider; install
      // the mapping interception afterwards so it only sees the consented generation.
      await app.panel.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] });
      app.panel.onEvent = (method, event) => {
        if (method !== 'Fetch.requestPaused') return;
        void (async () => {
          requests++;
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
          await app.panel.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
            body: Buffer.from(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ assignments, unmapped: [] }) } }] })).toString('base64') });
        })().catch(error => { mockError = String(error); void app.panel.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }); });
      };
      await app.panel.upload(`tests/fixtures/generated/${scenario.id}.pdf`);
      await expect.poll(() => app.panel.text()).toContain(`${scenario.id}.pdf`);
      // One button moves to Step 2; nothing is sent until the consent action.
      await app.panel.click('AI help me fill');
      await expect.poll(() => app.panel.text()).toContain('Review what you share');
      expect(requests).toBe(0);
      expect(await app.page.locator('input[name="fullName"]').inputValue()).toBe('');
      // Step 2 focuses on labels/values: no drop zone or document cards.
      expect(await app.panel.evaluate(() => document.querySelectorAll('.drop-zone, .doc-card').length)).toBe(0);
      await app.panel.click('Send to OpenAI and generate suggestions');
      await expect.poll(() => app.panel.text()).toContain('Review suggestions');
      expect(mockError).toBe(''); expect(requests).toBe(1);
      expect(await app.panel.evaluate(() => document.querySelectorAll('.review-row input:checked').length)).toBe(0);
      await app.panel.click('Select all supported suggestions');
      await app.panel.click('Fill selected (10)');
      await expect.poll(() => app.panel.text(), { timeout: 25_000 }).toContain('Operation results');
      expect(await app.panel.evaluate(() => [...document.querySelectorAll('.results .badge')].map(node => node.textContent))).toEqual(Array(10).fill('filled'));
      await app.page.locator('#rerender').click();
      for (const field of scenario.fields) await expect(app.page.locator(`[name="${field.name}"]`)).toHaveValue(field.expected!);
      const state = JSON.parse(await app.page.locator('#state').innerText());
      expect(state.fullName).toBe(scenario.fields[0].expected);
      // A user edit after filling must survive undo.
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
