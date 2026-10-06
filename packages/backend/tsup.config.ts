import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'transcode.worker': 'src/modules/transcoder/transcode.worker.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: false,
  shims: true,
  noExternal: ['@wavelet/shared'],
});
