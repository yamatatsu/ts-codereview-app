import { Result } from '@praha/byethrow';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { createFixtureRepo, type FixtureRepo } from '../testing/fixture';
import { resolveLocalTarget } from './resolve';
import { DEFAULT_COLLAPSED_GLOBS, DEFAULT_TEST_GLOBS } from './target';

let repo: FixtureRepo | undefined;
afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

const projectOf = (dir: string) => ({
  id: 'p1',
  rootPath: dir,
  collapsedGlobs: [...DEFAULT_COLLAPSED_GLOBS],
  testGlobs: [...DEFAULT_TEST_GLOBS],
});

describe('resolveLocalTarget', () => {
  it('作業ツリーの変更（追加・変更・削除・未追跡）を分類つきで列挙する', async () => {
    repo = await createFixtureRepo({
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': 'export const b = 1;\n',
      'README.md': '# hi\n',
    });
    await repo.write({
      'src/a.ts': 'export const a = 2;\n',
      'src/a.test.ts': 'test\n',
      'pnpm-lock.yaml': 'x',
    });
    await repo.remove('src/b.ts');

    const result = await resolveLocalTarget(repo.git, projectOf(repo.dir), {
      kind: 'local-worktree',
      projectId: 'p1',
    });
    expect(result).toBeSuccess();
    if (Result.isFailure(result)) return;
    const files = result.value.files.map(({ path, status, kind }) => ({ path, status, kind }));
    expect(files).toEqual([
      { path: 'pnpm-lock.yaml', status: 'A', kind: 'collapsed' },
      { path: 'src/a.test.ts', status: 'A', kind: 'test' },
      { path: 'src/a.ts', status: 'M', kind: 'impl' },
      { path: 'src/b.ts', status: 'D', kind: 'impl' },
    ]);
    const a = result.value.files.find((f) => f.path === 'src/a.ts');
    expect(a?.baseBlob).toMatch(/^[0-9a-f]{40}$/);
    expect(a?.headBlob).toMatch(/^[0-9a-f]{40}$/);
    expect(a?.baseBlob).not.toBe(a?.headBlob);
  });

  it('ブランチと merge-base の差分を出し、rename を 1 エントリにする', async () => {
    repo = await createFixtureRepo({ 'src/old-name.ts': 'export const value = "a long enough content";\n' });
    await repo.run('checkout', '-q', '-b', 'feature');
    await repo.run('mv', 'src/old-name.ts', 'src/new-name.ts');
    await repo.commit('rename');
    await repo.run('checkout', '-q', 'main');
    await repo.write({ 'src/main-only.ts': 'x\n' });
    await repo.commit('main change');
    await repo.run('checkout', '-q', 'feature');

    const result = await resolveLocalTarget(repo.git, projectOf(repo.dir), {
      kind: 'local-branch',
      projectId: 'p1',
      branch: 'feature',
      baseBranch: 'main',
    });
    expect(result).toBeSuccess();
    if (Result.isFailure(result)) return;
    expect(result.value.files.map(({ path, oldPath, status }) => ({ path, oldPath, status }))).toEqual([
      { path: 'src/new-name.ts', oldPath: 'src/old-name.ts', status: 'R' },
    ]);
    expect(result.value.warnings).toEqual([]);
  });

  it('linguist-generated は collapsed になる', async () => {
    repo = await createFixtureRepo({ '.gitattributes': 'gen/** linguist-generated\n', 'gen/x.ts': 'a\n' });
    await repo.write({ 'gen/x.ts': 'b\n' });
    const result = await resolveLocalTarget(repo.git, projectOf(repo.dir), {
      kind: 'local-worktree',
      projectId: 'p1',
    });
    expect(Result.isSuccess(result) && result.value.files[0]?.kind).toBe('collapsed');
  });

  it('git リポジトリでなければ失敗する', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const os = await import('node:os');
    const dir = await mkdtemp(`${os.tmpdir()}/tsugi-nogit-`);
    const fixture = await createFixtureRepo();
    const result = await resolveLocalTarget(fixture.git, projectOf(dir), {
      kind: 'local-worktree',
      projectId: 'p1',
    });
    await fixture.cleanup();
    expect(Result.isFailure(result) && result.error.type).toBe('git.notARepository');
  });
});
