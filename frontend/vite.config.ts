import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  envDir: '..',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API in development: the browser talks to Vite, Vite forwards /api to `wrangler dev`.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
});
