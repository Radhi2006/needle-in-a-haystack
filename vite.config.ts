import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: true },
  // three.js memang besar; satu bundle ~180 KB gzip masih wajar untuk game
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: 'node' },
} as any);
