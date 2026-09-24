import { build } from 'vite';
import { mkdir, copyFile, cp, readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';

await build();
await build({ mode: 'content' });
await mkdir('dist/pdf', { recursive: true });
await copyFile('src/manifest.json', 'dist/manifest.json');
// Chrome requires _locales/<default_locale>/messages.json to exist at the
// extension root whenever the manifest declares default_locale. Missing files
// here make the extension fail to load with "Localization used, but default
// locale wasn't specified" or "Messages file not found".
await cp('src/_locales', 'dist/_locales', { recursive: true });
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/pdf/pdf.worker.min.mjs');
await cp('node_modules/pdfjs-dist/cmaps', 'dist/pdf/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'dist/pdf/standard_fonts', { recursive: true });

// Icons are pre-rendered PNGs committed under brand/icons/. The master source
// is brand/icon-master.png; regenerate the size variants any time it changes
// with: powershell -ExecutionPolicy Bypass -File scripts/render-icons.ps1
// The old procedural pixel-loop generator was removed - real brand assets beat
// a synthetic purple rectangle for store listing conversion.
await mkdir('dist/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await copyFile(`brand/icons/${size}.png`, `dist/icons/${size}.png`);
}
// Fail the build if the packaged content script needs module loading, permissions
// expand unexpectedly, or manifest resources are missing from the unpacked output.
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'sidePanel', 'storage'].sort());
assert(!manifest.host_permissions && !manifest.content_scripts && !manifest.web_accessible_resources);
assert.deepEqual(manifest.optional_host_permissions, [
  'https://api.openai.com/*', 'https://api.anthropic.com/*',
  'https://generativelanguage.googleapis.com/*', 'https://api.deepseek.com/*',
  'https://open.bigmodel.cn/*', 'https://openrouter.ai/*',
  'http://localhost/*', 'http://127.0.0.1/*',
  // Declared so the custom provider can request a specific private-LAN origin at
  // runtime (match patterns cannot express CIDR). localEndpointOrigin() restricts
  // requests to loopback/RFC1918, and only the exact entered host is ever prompted.
  'http://*/*',
]);
for (const path of [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons), 'content/index.js', 'pdf/pdf.worker.min.mjs']) {
  assert(!path.startsWith('dist/') && !path.includes('..') && !path.startsWith('/'));
  assert((await stat(`dist/${path}`)).isFile());
}
// If the manifest uses __MSG_*__ placeholders, the matching locale bundle must
// ship with the extension or Chrome will refuse to load it.
if (manifest.default_locale) {
  const messagesPath = `dist/_locales/${manifest.default_locale}/messages.json`;
  assert((await stat(messagesPath)).isFile(), `Missing ${messagesPath}`);
  const messages = JSON.parse(await readFile(messagesPath, 'utf8'));
  for (const placeholder of [manifest.name, manifest.description, manifest.action?.default_title, manifest.short_name]) {
    if (typeof placeholder !== 'string') continue;
    const match = /^__MSG_(.+?)__$/.exec(placeholder);
    if (!match) continue;
    assert(messages[match[1]]?.message, `Locale ${manifest.default_locale} is missing key "${match[1]}"`);
  }
}
const content = await readFile('dist/content/index.js', 'utf8');
new Script(content); // Parse as a classic script without executing browser code.
assert(!/\bimport\s*\(/.test(content), 'Content script must not load runtime chunks.');
console.log('Built and validated unpacked extension: dist/');
