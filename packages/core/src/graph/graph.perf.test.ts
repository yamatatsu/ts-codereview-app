import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { ImportGraph } from './graph';

const FILE_COUNT = 2000;
let dir: string;
const files: string[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'tsugi-perf-'));
  await writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler' } }),
  );
  // 40 パッケージ × 50 ファイル。各ファイルは同じディレクトリの 3 ファイルと外部パッケージを import する
  for (let i = 0; i < FILE_COUNT; i += 1) {
    const pkg = `src/pkg${Math.floor(i / 50)}`;
    const file = `${pkg}/mod${i}.ts`;
    files.push(file);
    const deps = [1, 2, 3]
      .map((d) => i - d)
      .filter((d) => d >= 0 && Math.floor(d / 50) === Math.floor(i / 50))
      .map((d) => `import { v${d} } from './mod${d}';`);
    await mkdir(path.join(dir, pkg), { recursive: true });
    await writeFile(
      path.join(dir, file),
      `${deps.join('\n')}\nimport { z } from 'zod';\nexport const v${i} = ${i};\nexport type T${i} = { a: number; b: string };\n`,
    );
  }
});

afterAll(() => rm(dir, { recursive: true, force: true }));

describe('ImportGraph の性能（docs/specs/06）', () => {
  it(`${FILE_COUNT} ファイルの初回構築が 5 秒以内`, async () => {
    const graph = new ImportGraph(dir);
    const started = performance.now();
    await graph.build(files);
    const elapsed = performance.now() - started;
    console.log(`ImportGraph: ${FILE_COUNT} files in ${elapsed.toFixed(0)}ms`);
    expect(graph.size).toBe(FILE_COUNT);
    expect(graph.outgoing('src/pkg0/mod10.ts').filter((e) => e.to.startsWith('src/'))).toHaveLength(3);
    expect(elapsed).toBeLessThan(5000);
  });
});
