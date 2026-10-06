import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { createE2eRepo, GIT } from './fixture';
import { startGitHubMock, type MockPull } from './github-mock';
import { callApi, launchApp, type Launched } from './launch';

let launched: Launched;
let mock: Awaited<ReturnType<typeof startGitHubMock>>;
let clone: string;
let projectId: string;
let pulls: MockPull[];

const git = (cwd: string, ...args: string[]) => execFileSync(GIT, args, { cwd, encoding: 'utf8' }).trim();

beforeAll(async () => {
  // upstream：main に初期状態、refs/pull/7/head に PR のコミット
  const upstream = createE2eRepo();
  git(upstream, 'stash', '-u');
  git(upstream, 'checkout', '-q', '-b', 'feature/greet');
  writeFileSync(
    path.join(upstream, 'src/greet.ts'),
    "import { add } from './math';\n\nexport const greet = () => `1+1=${add(1, 1)}`;\n",
  );
  git(upstream, 'add', '-A');
  git(upstream, 'commit', '-q', '-m', 'add greet');
  const head = git(upstream, 'rev-parse', 'HEAD');
  git(upstream, 'update-ref', 'refs/pull/7/head', head);
  git(upstream, 'checkout', '-q', 'main');

  clone = path.join(realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tsugi-e2e-clone-'))), 'repo');
  git(os.tmpdir(), 'clone', '-q', upstream, clone);

  pulls = [
    {
      number: 7,
      title: 'greet を追加',
      headSha: head,
      headRef: 'feature/greet',
      baseRef: 'main',
      state: 'open',
    },
  ];
  mock = await startGitHubMock('octo', 'fixture', pulls);
  launched = await launchApp({ TSUGI_GITHUB_API_URL: mock.url });
  const project = await callApi<{ id: string }>(launched.page, 'POST', '/projects', { rootPath: clone });
  projectId = project.id;
  await callApi(launched.page, 'PATCH', `/projects/${projectId}`, { githubRemote: 'octo/fixture' });
});

afterAll(async () => {
  await launched?.app.close();
  await mock?.close();
});

describe('GitHub PR のレビュー', () => {
  it('PAT を疎通確認してから保存する', async () => {
    const saved = await callApi<{ hasPat?: boolean; error?: unknown }>(
      launched.page,
      'PUT',
      `/projects/${projectId}/pat`,
      {
        token: 'github_pat_e2e_dummy_token_0000000000',
      },
    );
    expect(saved.error).toBeUndefined();
    expect(saved.hasPat).toBe(true);
    expect(
      mock.requests.some((r) => r.startsWith('GET /repos/octo/fixture ') && r.endsWith('auth=yes')),
    ).toBe(true);
  });

  it('PR 一覧から開くと worktree が作られ、差分とジャンプが使える', async () => {
    const { page } = launched;
    // API で直接登録したので、一覧を読み直す
    await page.evaluate(() => (location.hash = '#/'));
    await page.reload();
    await page.getByRole('button', { name: 'レビューを開始' }).first().click();
    try {
      await page.getByText('greet を追加').click({ timeout: 10_000 });
    } catch (error) {
      await page.screenshot({ path: '/tmp/tsugi-shots/e2e-pr-dialog.png' });
      throw error;
    }
    await page.getByText('greet.ts', { exact: true }).waitFor({ timeout: 60_000 });

    const worktree = path.join(launched.userData, 'worktrees', projectId, 'pr-7');
    expect(existsSync(path.join(worktree, 'src/greet.ts'))).toBe(true);
    // 作業中の clone は汚さない
    expect(existsSync(path.join(clone, 'src/greet.ts'))).toBe(false);

    await page.getByText('greet.ts', { exact: true }).click();
    const token = page.locator('diffs-container').locator('span', { hasText: /^add$/ }).last();
    await token.waitFor();
    await expect.poll(() => page.getByText('TS ready').count(), { timeout: 30_000 }).toBe(1);
    await token.click({ modifiers: ['Meta'] });
    await expect
      .poll(() => page.locator('[data-current-file]').textContent(), {
        timeout: 15_000,
      })
      .toContain('src/math.ts');
  });

  it('worktree を削除できる', async () => {
    const list = await callApi<{ id: string; path: string }[]>(launched.page, 'GET', '/worktrees');
    expect(list).toHaveLength(1);
    const first = list[0] as { id: string; path: string };
    await callApi(launched.page, 'DELETE', `/worktrees/${first.id}`);
    expect(existsSync(first.path)).toBe(false);
    expect(git(clone, 'for-each-ref', 'refs/tsugi')).toBe('');
  });

  it('PR が closed になったら worktree を自動で削除する', async () => {
    const { page } = launched;
    await callApi(page, 'POST', '/targets/resolve', { target: { kind: 'pr', projectId, number: 7 } });
    expect(await callApi<unknown[]>(page, 'GET', '/worktrees')).toHaveLength(1);
    (pulls[0] as MockPull).state = 'closed';
    // PR 一覧の取得をきっかけに後始末が走る
    await callApi(page, 'GET', `/projects/${projectId}/pulls`);
    await expect.poll(async () => (await callApi<unknown[]>(page, 'GET', '/worktrees')).length).toBe(0);
  });
});
