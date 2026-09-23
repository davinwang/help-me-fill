import { build } from 'vite';
import { mkdir, copyFile, cp, writeFile, readFile, stat } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
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

// Generate original PNG icons without native build dependencies.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
await mkdir('dist/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const paper = nx > .23 && nx < .77 && ny > .16 && ny < .84;
    const line = nx > .34 && nx < .66 && [.34, .48, .62].some(v => Math.abs(ny - v) < .024);
    const rgb = paper && !line ? [247, 248, 255] : [77, 69, 205];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set([...rgb, 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  await writeFile(`dist/icons/${size}.png`, Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
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
  'https://api.moonshot.cn/*', 'https://llm-8qqdhr2i4l0ydvm2.cn-beijing.maas.aliyuncs.com/*',
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
