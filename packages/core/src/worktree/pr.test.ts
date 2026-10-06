import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { collectChangedFiles } from '../review/resolve';
import { DEFAULT_COLLAPSED_GLOBS, DEFAULT_TEST_GLOBS } from '../review/target';
import { createFixtureRepo } from '../testing/fixture';
import { preparePrWorktree, removePrWorktree } from './pr';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

/** upstream（PR の ref を持つ）と、それを clone した作業リポジトリを作る */
const setup = async () => {
  const upstream = await createFixtureRepo({ 'src/a.ts': 'export const a = 1;\n' });
  cleanups.push(upstream.cleanup);
  await upstream.run('checkout', '-q', '-b', 'feature');
  await upstream.write({ 'src/a.ts': 'export const a = 2;\n', 'src/b.ts': 'export const b = 1;\n' });
  const prHead = await upstream.commit('pr change');
  // GitHub と同じように refs/pull/<n>/head を作る
  await upstream.run('update-ref', 'refs/pull/7/head', prHead);
  await upstream.run('checkout', '-q', 'main');

  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tsugi-clone-')));
  const clone = path.join(parent, 'clone');
  await upstream.run('clone', '-q', upstream.dir, clone);
  cleanups.push(async () => (await import('node:fs/promises')).rm(parent, { recursive: true, force: true }));
  return { upstream, clone, parent, prHead };
};

describe('preparePrWorktree', () => {
  it('PR の head を fetch して worktree を作り、merge-base との差分が取れる', async () => {
    const { upstream, clone, parent, prHead } = await setup();
    const worktreeDir = path.join(parent, 'worktrees', 'pr-7');
    const result = await preparePrWorktree({
      git: upstream.git,
      repoPath: clone,
      remote: 'origin',
      prNumber: 7,
      baseBranch: 'main',
      worktreeDir,
    });
    expect(result).toBeSuccess();
    if (Result.isFailure(result)) return;
    expect(result.value.headRev).toBe(prHead);
    expect(result.value.created).toBe(true);
    expect(await readFile(path.join(worktreeDir, 'src/a.ts'), 'utf8')).toBe('export const a = 2;\n');

    const files = await collectChangedFiles(
      upstream.git,
      {
        repoPath: clone,
        workspacePath: worktreeDir,
        baseRev: result.value.baseRev,
        headRev: result.value.headRev,
      },
      {
        id: 'p',
        rootPath: clone,
        collapsedGlobs: [...DEFAULT_COLLAPSED_GLOBS],
        testGlobs: [...DEFAULT_TEST_GLOBS],
      },
    );
    expect(Result.isSuccess(files) && files.value.map((f) => `${f.status} ${f.path}`)).toEqual([
      'M src/a.ts',
      'A src/b.ts',
    ]);

    // 追加 push → 2 回目は既存の worktree を更新する
    await upstream.run('checkout', '-q', 'feature');
    await upstream.write({ 'src/c.ts': 'export const c = 1;\n' });
    const newHead = await upstream.commit('more');
    await upstream.run('update-ref', 'refs/pull/7/head', newHead);
    const second = await preparePrWorktree({
      git: upstream.git,
      repoPath: clone,
      remote: 'origin',
      prNumber: 7,
      baseBranch: 'main',
      worktreeDir,
    });
    expect(Result.isSuccess(second) && second.value).toMatchObject({ headRev: newHead, created: false });
    expect(existsSync(path.join(worktreeDir, 'src/c.ts'))).toBe(true);

    expect(await removePrWorktree(upstream.git, clone, 7, worktreeDir)).toBeSuccess();
    expect(existsSync(worktreeDir)).toBe(false);
  });

  it('存在しない PR は失敗する', async () => {
    const { upstream, clone, parent } = await setup();
    const result = await preparePrWorktree({
      git: upstream.git,
      repoPath: clone,
      remote: 'origin',
      prNumber: 999,
      baseBranch: 'main',
      worktreeDir: path.join(parent, 'wt'),
    });
    expect(Result.isFailure(result) && result.error.type).toBe('git.commandFailed');
  });
});
