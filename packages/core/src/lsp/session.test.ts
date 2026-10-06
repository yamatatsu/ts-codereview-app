import path from 'node:path';

import { Result } from '@praha/byethrow';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { createFixtureRepo, type FixtureRepo } from '../testing/fixture';
import { LspSession } from './session';
import { resolveBundledTscPath } from './tsc-path';

let repo: FixtureRepo;
let session: LspSession;

beforeAll(async () => {
  // project references と workspace パッケージ、paths エイリアスを含む monorepo
  repo = await createFixtureRepo({
    'package.json': JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }),
    'tsconfig.json': JSON.stringify({
      files: [],
      references: [{ path: './packages/lib' }, { path: './packages/app' }],
    }),
    'packages/lib/package.json': JSON.stringify({
      name: '@fx/lib',
      type: 'module',
      exports: { '.': './src/index.ts' },
    }),
    'packages/lib/tsconfig.json': JSON.stringify({
      compilerOptions: {
        composite: true,
        strict: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        rootDir: 'src',
      },
      include: ['src'],
    }),
    'packages/lib/src/index.ts': 'export function greet(name: string): string {\n  return `hi ${name}`;\n}\n',
    'packages/app/tsconfig.json': JSON.stringify({
      compilerOptions: {
        composite: true,
        strict: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        rootDir: 'src',
        paths: { '@fx/lib': ['../lib/src/index.ts'], '~/*': ['./src/*'] },
      },
      include: ['src'],
      references: [{ path: '../lib' }],
    }),
    'packages/app/src/util.ts': 'export const twice = (n: number) => n * 2;\n',
    'packages/app/src/main.ts':
      "import { greet } from '@fx/lib';\nimport { twice } from '~/util';\nexport const msg = greet('x') + twice(2);\n",
  });
  session = new LspSession({
    tscPath: await resolveBundledTscPath(import.meta.dirname),
    workspacePath: repo.dir,
  });
  const started = session.start();
  if (started.type === 'Failure') throw new Error(JSON.stringify(started.error));
});

afterAll(async () => {
  await session.stop();
  await repo.cleanup();
});

const main = () => path.join(repo.dir, 'packages/app/src/main.ts');

describe('LspSession (tsc --lsp)', () => {
  it('パッケージをまたいで定義ジャンプできる', async () => {
    const result = await session.definition(main(), { line: 2, character: 20 });
    expect(result).toBeSuccess();
    if (Result.isFailure(result)) return;
    expect(result.value[0]?.absPath).toBe(path.join(repo.dir, 'packages/lib/src/index.ts'));
    expect(result.value[0]?.range.start.line).toBe(0);
  });

  it('paths エイリアス経由で定義ジャンプできる', async () => {
    const result = await session.definition(main(), { line: 2, character: 33 });
    expect(Result.isSuccess(result) && result.value[0]?.absPath).toBe(
      path.join(repo.dir, 'packages/app/src/util.ts'),
    );
  });

  it('hover で型が得られる', async () => {
    const result = await session.hover(main(), { line: 2, character: 20 });
    expect(Result.isSuccess(result) && result.value?.contents).toContain('greet(name: string): string');
  });

  it('参照を検索できる', async () => {
    const lib = path.join(repo.dir, 'packages/lib/src/index.ts');
    const result = await session.references(lib, { line: 0, character: 17 });
    expect(result).toBeSuccess();
    if (Result.isFailure(result)) return;
    expect(result.value.map((l) => path.relative(repo.dir, l.absPath))).toContain('packages/app/src/main.ts');
  });

  it('documentSymbol を返す', async () => {
    const result = await session.documentSymbols(main());
    expect(Result.isSuccess(result) && result.value.map((s) => s.name)).toContain('msg');
  });
});

describe('起動できないとき', () => {
  it('cwd の workspace が消えていても例外にせず、error 状態にする', async () => {
    const statuses: string[] = [];
    const missing = new LspSession({
      tscPath: await resolveBundledTscPath(import.meta.dirname),
      workspacePath: path.join(repo.dir, 'removed-worktree'),
      onStatus: (status) => statuses.push(status),
    });
    // spawn の失敗は error イベントで非同期に届く。リスナーがないと未捕捉例外になる
    expect(missing.start()).toBeSuccess();
    await expect.poll(() => statuses.at(-1)).toBe('error');
    await missing.stop();
  });
});
