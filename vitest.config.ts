import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    fileParallelism: false,
    isolate: false,
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@wavelet/backend': path.resolve(__dirname, './packages/backend/src/index.ts'),
      '@wavelet/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },
});
