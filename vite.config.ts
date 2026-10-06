import byethrow from '@praha/byethrow-oxlint';
import { defineConfig } from 'vite-plus';

const CHILD_PROCESS_RESTRICTIONS = [
  { name: 'node:child_process', message: '子プロセスは @tsugi/core の spawnSafe を使ってください' },
  { name: 'child_process', message: '子プロセスは @tsugi/core の spawnSafe を使ってください' },
];

export default defineConfig({
  run: {
    cache: true,
    tasks: {
      test: { command: 'vp run -r test', cache: false },
    },
  },
  fmt: {
    ignorePatterns: ['**/dist/**', '**/out/**', '**/release/**', 'pnpm-lock.yaml', '.claude/**'],
    singleQuote: true,
    semi: true,
    printWidth: 110,
    sortImports: {},
    sortTailwindcss: {
      stylesheet: './apps/desktop/src/renderer/styles.css',
    },
    sortPackageJson: true,
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/out/**', '**/release/**', '**/components/ui/**'],
    plugins: ['typescript', 'unicorn', 'oxc', 'import'],
    extends: [byethrow.recommended],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-console': 'off',
      'typescript/no-floating-promises': 'error',
      'typescript/no-explicit-any': 'error',
    },
    overrides: [
      {
        // 子プロセスは spawnSafe 経由のみ（docs/adr/0016）
        files: ['apps/desktop/src/**'],
        rules: {
          'no-restricted-imports': ['error', { paths: CHILD_PROCESS_RESTRICTIONS }],
        },
      },
      {
        // core は Electron に依存しない（docs/adr/0006）
        files: ['packages/core/src/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                ...CHILD_PROCESS_RESTRICTIONS,
                { name: 'electron', message: 'core は Electron 非依存です' },
              ],
            },
          ],
        },
      },
      {
        files: ['apps/desktop/src/renderer/**'],
        plugins: ['react'],
      },
      {
        files: ['**/*.test.ts', '**/*.test.tsx'],
        plugins: ['vitest'],
      },
    ],
  },
  staged: {
    '*.{ts,tsx,js,json,md,css}': 'vp check --fix',
  },
});
