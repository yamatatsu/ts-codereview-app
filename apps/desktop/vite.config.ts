import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

/** main / analysis / preload は tsdown（vp pack）で Node 向けにバンドルする（docs/adr/0004） */
const isBundled = (id: string) => id.startsWith('@tsugi/');
const external = (id: string) =>
  !id.startsWith('.') &&
  !id.startsWith('/') &&
  !id.startsWith('\0') &&
  !isBundled(id) &&
  !/^[A-Za-z]:/.test(id);

const nodeEntry = (name: 'main' | 'analysis') => ({
  entry: { index: `src/${name}/index.ts` },
  outDir: `out/${name}`,
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'node24',
  fixedExtension: false,
  sourcemap: true,
  clean: true,
  dts: false,
  deps: { neverBundle: external, alwaysBundle: [/^@tsugi\//], onlyBundle: false as const },
});

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src/renderer', import.meta.url).pathname },
  },
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome140',
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  pack: [
    nodeEntry('main'),
    nodeEntry('analysis'),
    {
      // sandbox: true の preload は CommonJS で、electron 以外を require できない
      entry: { index: 'src/preload/index.ts' },
      outDir: 'out/preload',
      format: 'cjs',
      platform: 'node',
      target: 'node24',
      fixedExtension: true,
      clean: true,
      dts: false,
      deps: { neverBundle: ['electron'], onlyBundle: false },
    },
  ],
  test: {
    include: ['**/*.test.{ts,tsx}'],
    environment: 'node',
  },
  run: {
    tasks: {
      dev: { command: 'node scripts/dev.ts', cache: false },
      e2e: { command: ['vp build', 'vp pack', 'vp test --config e2e/vite.config.ts'], cache: false },
      'build:all': { command: ['vp build', 'vp pack'], cache: false },
      package: { command: ['vp build', 'vp pack', 'electron-builder --dir --arm64'], cache: false },
    },
  },
});
