import { defineConfig } from 'vite-plus';

/** Electron の E2E（Playwright _electron）。ビルド済みの out/ を起動する。CI では実行しない（docs/adr/0019） */
export default defineConfig({
  test: {
    include: ['**/*.e2e.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    expect: { poll: { timeout: 10_000 } },
  },
});
