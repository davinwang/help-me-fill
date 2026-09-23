import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Aggressive Terser settings used for production builds only.
// Property mangling is intentionally disabled — renaming keys would break
// chrome.* API calls, pdf.js internals, and message payloads.
const productionMinify = {
  minify: 'terser' as const,
  terserOptions: {
    mangle: { toplevel: true, properties: false },
    compress: { passes: 2, drop_console: true, drop_debugger: true },
    format: { comments: false },
  },
  sourcemap: false,
};

// Non-build invocations (e.g. `vite serve`) fall back to fast esbuild minify.
const developmentMinify = {
  minify: 'esbuild' as const,
  sourcemap: false,
};

export default defineConfig(({ command, mode }) => {
  const minifyConfig = command === 'build' ? productionMinify : developmentMinify;

  return mode === 'content' ? {
    publicDir: false,
    build: {
      outDir: 'dist', emptyOutDir: false, target: 'es2022',
      lib: { entry: resolve('src/content/index.ts'), name: 'HelpMeFill', formats: ['iife'], fileName: () => 'content/index.js' },
      ...minifyConfig,
    },
  } : {
    root: resolve('src'), base: './', publicDir: false,
    plugins: [react()],
    build: {
      outDir: resolve('dist'), emptyOutDir: true, target: 'es2022',
      rollupOptions: {
        input: { sidepanel: resolve('src/sidepanel/index.html'), background: resolve('src/background/service-worker.ts') },
        output: { entryFileNames: chunk => chunk.name === 'background' ? 'background/service-worker.js' : 'assets/[name]-[hash].js' },
      },
      ...minifyConfig,
    },
  };
});
