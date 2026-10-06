import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import { describe, expect, it } from 'vite-plus/test';

import { GitClient } from '../git/client';
import { LspSession } from '../lsp/session';
import { resolveBundledTscPath } from '../lsp/tsc-path';
import { findGit } from '../testing/fixture';
import { ImportGraph } from './graph';

/**
 * 実リポジトリでの性能計測（docs/plans/0008）。TSUGI_PERF_REPO を指定したときだけ実行する。
 *   TSUGI_PERF_REPO=/path/to/repo vp test src/graph/real-repo.perf.test.ts
 */
const repo = process.env['TSUGI_PERF_REPO'];

describe.skipIf(!repo)('実リポジトリでの性能', () => {
  it('ファイル一覧・グラフ構築・LSP の初回応答', { timeout: 600_000 }, async () => {
    const root = repo as string;
    const git = new GitClient({ gitPath: findGit() });
    let t = performance.now();
    const files = await git.lsFiles(root);
    if (Result.isFailure(files)) throw new Error('ls-files failed');
    const lsMs = performance.now() - t;

    t = performance.now();
    const graph = new ImportGraph(root);
    await graph.build(files.value);
    const graphMs = performance.now() - t;
    const edges = graph.files().reduce((n, f) => n + graph.outgoing(f).length, 0);

    // import の多いファイルを選んで、最初の import 先への定義ジャンプを計測する
    const sample = graph
      .files()
      .filter(
        (f) =>
          f.endsWith('.ts') &&
          !f.endsWith('.d.ts') &&
          graph.outgoing(f).some((e) => !e.to.startsWith('npm:')),
      )
      .sort((a, b) => graph.outgoing(b).length - graph.outgoing(a).length)[0] as string;
    const session = new LspSession({
      tscPath: await resolveBundledTscPath(import.meta.dirname),
      workspacePath: root,
      requestTimeoutMs: 300_000,
    });
    t = performance.now();
    session.start();
    const symbols = await session.documentSymbols(path.join(root, sample));
    const lspMs = performance.now() - t;
    await session.stop();

    const report = JSON.stringify(
      {
        files: files.value.length,
        scanned: graph.size,
        edges,
        lsFilesMs: Math.round(lsMs),
        graphBuildMs: Math.round(graphMs),
        lspFirstResponseMs: Math.round(lspMs),
        sample,
        symbols: Result.isSuccess(symbols) ? symbols.value.length : symbols.error,
      },
      null,
      2,
    );
    console.log(report);
    if (process.env['TSUGI_PERF_OUT']) writeFileSync(process.env['TSUGI_PERF_OUT'], report);
    expect(graph.size).toBeGreaterThan(0);
  });
});
