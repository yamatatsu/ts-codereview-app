/**
 * 本物の GitHub を使う E2E（docs/adr/0019）。
 * fixture リポジトリ yamatatsu/tsugi-e2e-fixture の PR #1 を読むだけで、GitHub には書き込まない。
 *
 * TSUGI_E2E_GITHUB=1 のときだけ実行する。PAT は GH_TOKEN から読み、アプリには
 * 設定画面と同じ API（PUT /projects/:id/pat）で渡す（アプリ自身は環境変数を読まない。docs/adr/0013）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { GIT } from './fixture';
import { callApi, launchApp, type Launched } from './launch';

const REPO = 'yamatatsu/tsugi-e2e-fixture';
const PR = 1;
const enabled = process.env['TSUGI_E2E_GITHUB'] === '1';
const token = process.env['GH_TOKEN'] ?? '';

let launched: Launched;
let clone: string;
let projectId: string;

const git = (cwd: string, ...args: string[]) => execFileSync(GIT, args, { cwd, encoding: 'utf8' }).trim();

describe.skipIf(!enabled)('本物の GitHub での PR レビュー', () => {
  beforeAll(async () => {
    if (!token) throw new Error('TSUGI_E2E_GITHUB=1 のときは GH_TOKEN に PAT を設定してください');
    clone = path.join(realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tsugi-e2e-live-'))), 'repo');
    git(os.tmpdir(), 'clone', '-q', `https://github.com/${REPO}.git`, clone);
    launched = await launchApp();
  });

  afterAll(async () => {
    if (launched && projectId) {
      const list = await callApi<{ id: string }[]>(launched.page, 'GET', '/worktrees');
      for (const wt of list) await callApi(launched.page, 'DELETE', `/worktrees/${wt.id}`);
    }
    await launched?.app.close();
  });

  it('origin から GitHub のリポジトリを判定する', async () => {
    const project = await callApi<{ id: string; githubRemote: string | null }>(
      launched.page,
      'POST',
      '/projects',
      { rootPath: clone },
    );
    projectId = project.id;
    expect(project.githubRemote).toBe(REPO);
  });

  it('無効な PAT は保存しない', async () => {
    const saved = await callApi<{ hasPat?: boolean; error?: { type: string } }>(
      launched.page,
      'PUT',
      `/projects/${projectId}/pat`,
      { token: 'github_pat_invalid_0000000000000000000000' },
    );
    expect(saved.error?.type).toMatch(/^github\./);
    const projects = await callApi<{ id: string; hasPat: boolean }[]>(launched.page, 'GET', '/projects');
    expect(projects.find((p) => p.id === projectId)?.hasPat).toBe(false);
  });

  it('PAT を疎通確認してから保存し、PR 一覧を取得する', async () => {
    const saved = await callApi<{ hasPat?: boolean; error?: unknown }>(
      launched.page,
      'PUT',
      `/projects/${projectId}/pat`,
      { token },
    );
    expect(saved.error).toBeUndefined();
    expect(saved.hasPat).toBe(true);

    const pulls = await callApi<{ number: number; title: string }[] | { error: unknown }>(
      launched.page,
      'GET',
      `/projects/${projectId}/pulls`,
    );
    expect(Array.isArray(pulls), JSON.stringify(pulls)).toBe(true);
    expect((pulls as { number: number }[]).map((p) => p.number)).toContain(PR);
  });

  it('PR を開くと worktree に展開され、差分・テスト対応・ジャンプが使える', async () => {
    const { page } = launched;
    await page.evaluate(() => (location.hash = '#/'));
    await page.reload();
    await page.getByRole('button', { name: 'レビューを開始' }).first().click();
    await page.getByText('greet を追加（E2E fixture・マージしない）').click({ timeout: 15_000 });
    await page.getByText('greet.ts', { exact: true }).waitFor({ timeout: 60_000 });

    const worktree = path.join(launched.userData, 'worktrees', projectId, `pr-${PR}`);
    expect(existsSync(path.join(worktree, 'src/greet.ts'))).toBe(true);
    // 作業中の clone は汚さない
    expect(existsSync(path.join(clone, 'src/greet.ts'))).toBe(false);

    // PR の情報と変更ファイルが GitHub と一致する
    const key = decodeURIComponent((await page.evaluate(() => location.hash)).replace(/^#\/review\//, ''));
    const target = await callApi<{
      files: { path: string }[];
      pr?: { number: number; headSha: string };
      install?: string;
    }>(page, 'GET', `/targets/${encodeURIComponent(key)}`);
    expect(target.pr?.number).toBe(PR);
    expect(target.pr?.headSha).toBe(git(clone, 'ls-remote', 'origin', `refs/pull/${PR}/head`).split('\t')[0]);
    expect(target.files.map((f) => f.path).sort()).toEqual([
      'src/greet.test.ts',
      'src/greet.ts',
      'src/math.ts',
    ]);
    // lockfile があるので、オフライン install が成功する
    await expect
      .poll(
        async () =>
          (await callApi<{ install?: string }>(page, 'GET', `/targets/${encodeURIComponent(key)}`)).install,
        { timeout: 60_000 },
      )
      .toBe('ok');

    // テストと実装の対応付け
    await expect
      .poll(
        async () => {
          const links = await callApi<{ links: { implPath: string; testPath: string }[]; ready: boolean }>(
            page,
            'GET',
            `/targets/${encodeURIComponent(key)}/test-links`,
          );
          return links.ready ? links.links.map((l) => `${l.implPath} <- ${l.testPath}`).sort() : null;
        },
        { timeout: 30_000 },
      )
      .toEqual(
        expect.arrayContaining(['src/greet.ts <- src/greet.test.ts', 'src/math.ts <- src/math.test.ts']),
      );

    // 定義ジャンプ
    await page.getByText('greet.ts', { exact: true }).click();
    const tokenEl = page.locator('diffs-container').locator('span', { hasText: /^add$/ }).last();
    await tokenEl.waitFor();
    await expect.poll(() => page.getByText('TS ready').count(), { timeout: 30_000 }).toBe(1);
    await tokenEl.click({ modifiers: ['Meta'] });
    await expect
      .poll(() => page.locator('[data-current-file]').textContent(), { timeout: 15_000 })
      .toContain('src/math.ts');
  });

  it('worktree を削除すると clone に作った ref も消える', async () => {
    const list = await callApi<{ id: string; path: string }[]>(launched.page, 'GET', '/worktrees');
    expect(list).toHaveLength(1);
    const first = list[0] as { id: string; path: string };
    await callApi(launched.page, 'DELETE', `/worktrees/${first.id}`);
    expect(existsSync(first.path)).toBe(false);
    expect(git(clone, 'for-each-ref', 'refs/tsugi')).toBe('');
  });
});
