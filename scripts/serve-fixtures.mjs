import './fixtures.mjs';
import { createServer } from 'vite';
const server = await createServer({ configFile: 'tests/fixtures/vite.config.ts', server: { host: '127.0.0.1' } });
await server.listen();
server.printUrls();
