import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // GitHub Pages serves a project site at /<repo>/; the Pages workflow builds
  // with CALCO_BASE=/calco/ so assets (and the WASM engine) resolve under the
  // repo path. Dev stays at the root.
  base: process.env.CALCO_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // @xyflow/react (used by the canvas store) references the DOM at import.
    environment: 'jsdom',
  },
});
