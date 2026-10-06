import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/testing/setup.ts'],
    testTimeout: 30_000,
  },
});
