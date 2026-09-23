import { createServer } from 'vite';
import { benchmarkCases } from '../tests/fixtures/cases.ts';
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const provider = option('--provider'), model = option('--model'), apiKey = process.env.HELP_ME_FILL_API_KEY;
if (!args.includes('--allow-paid-requests') || !provider || !model || !apiKey) {
  console.log('No provider requests made. To benchmark synthetic data, set HELP_ME_FILL_API_KEY and run: npm run benchmark -- --provider <openai|deepseek|anthropic|gemini> --model <model-id> --allow-paid-requests');
  console.log('This explicitly sends 12 synthetic cases (up to 24 requests including repairs) to the selected provider and may incur charges. Never pass keys as command arguments.');
  process.exitCode = 1;
} else {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createProvider } = await server.ssrLoadModule('/src/ai/provider.ts');
    const { isProvider } = await server.ssrLoadModule('/src/ai/registry.ts');
    if (!isProvider(provider)) throw new Error('Unsupported provider preset.');
    let proposed = 0, correct = 0, possible = 0, failed = 0;
    for (const scenario of benchmarkCases) {
      possible += scenario.fields.filter(field => field.expected !== null).length;
      const fields = scenario.fields.map(field => ({ id: field.name, name: field.name, label: field.label, type: field.type, ariaLabel: '', placeholder: '', context: scenario.context, required: false, maxLength: -1, pattern: '' }));
      const lines = scenario.lines.map((text, index) => ({ id: `p1-l${index + 1}`, page: 1, text }));
      try {
        const result = await createProvider({ provider, model, apiKey }).map({ lines, fields, signal: new AbortController().signal });
        const hits = result.plan.assignments.filter(item => scenario.fields.find(field => field.name === item.fieldId)?.expected === item.value).length;
        proposed += result.plan.assignments.length; correct += hits;
        console.log(JSON.stringify({ case: scenario.id, proposed: result.plan.assignments.length, correct: hits, elapsedMs: result.elapsedMs, calls: result.calls, usage: result.usage }));
      } catch { failed++; console.log(JSON.stringify({ case: scenario.id, status: 'failed; no response data logged' })); }
    }
    const precision = proposed ? correct / proposed : 0, coverage = possible ? correct / possible : 0;
    console.log(JSON.stringify({ provider, model, cases: benchmarkCases.length, failedCases: failed, proposed, correct, possible, precision, coverage, targetMet: !failed && precision >= .95 && coverage >= .80 }, null, 2));
    if (failed || precision < .95 || coverage < .80) process.exitCode = 1;
  } finally { await server.close(); }
}
