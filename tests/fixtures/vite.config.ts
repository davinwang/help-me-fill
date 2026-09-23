import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve('tests/fixtures'), plugins: [react()], server: { port: 4173, strictPort: true } });
