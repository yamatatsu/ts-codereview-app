import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { createFixtureRepo, type FixtureRepo } from '../testing/fixture';
import { ImportGraph } from './graph';

let repo: FixtureRepo;
beforeAll(async () => {
  repo = await createFixtureRepo({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { module: 'esnext', moduleResolution: 'bundler', paths: { '@/*': ['./src/*'] } },
    }),
    'src/a.ts':
      "import { b } from './b.js';\nimport { c } from '@/c';\nimport { z } from 'zod';\nexport const a = b + c;\n",
    'src/b.ts': "import type { C } from './c';\nexport const b = 1;\n",
    'src/c.ts': "export * from './d';\nexport const c = 2;\nexport type C = number;\n",
    'src/d.ts': 'export const d = 3;\n',
    'src/cycle1.ts': "import './cycle2';\n",
    'src/cycle2.ts': "import './cycle1';\n",
  });
});
afterAll(() => repo.cleanup());

const build = async () => {
  const graph = new ImportGraph(repo.dir);
  await graph.build([
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
    'src/d.ts',
    'src/cycle1.ts',
    'src/cycle2.ts',
    'README.md',
  ]);
  return graph;
};

describe('ImportGraph', () => {
  it('.js 拡張子・paths エイリアス・外部パッケージ・re-export を解決する', async () => {
    const graph = await build();
    expect(graph.outgoing('src/a.ts')).toEqual([
      { from: 'src/a.ts', to: 'src/b.ts', kind: 'static' },
      { from: 'src/a.ts', to: 'src/c.ts', kind: 'static' },
      { from: 'src/a.ts', to: 'npm:zod', kind: 'static' },
    ]);
    expect(graph.outgoing('src/b.ts')).toEqual([{ from: 'src/b.ts', to: 'src/c.ts', kind: 'type-only' }]);
    expect(graph.outgoing('src/c.ts')).toEqual([{ from: 'src/c.ts', to: 'src/d.ts', kind: 're-export' }]);
    expect(graph.incoming('src/c.ts').sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph.size).toBe(6);
  });

  it('近傍を両方向に辿る', async () => {
    const graph = await build();
    const one = graph.neighborhood(['src/b.ts'], 1);
    expect(one.files.sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    const noTypes = graph.neighborhood(['src/b.ts'], 1, { includeTypeOnly: false });
    expect(noTypes.files.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('差分更新で消えたエッジが反映される', async () => {
    const graph = await build();
    await repo.write({ 'src/b.ts': 'export const b = 1;\n' });
    await graph.update(['src/b.ts'], []);
    expect(graph.outgoing('src/b.ts')).toEqual([]);
    expect(graph.incoming('src/c.ts')).toEqual(['src/a.ts']);
    await graph.update([], ['src/d.ts']);
    expect(graph.hasFile('src/d.ts')).toBe(false);
  });
});
