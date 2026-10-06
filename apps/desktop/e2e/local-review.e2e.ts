import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { createE2eRepo } from './fixture';
import { callApi, launchApp, type Launched } from './launch';

let launched: Launched;
let repo: string;
let targetKey: string;

const diffToken = (text: string) =>
  launched.page
    .locator('diffs-container')
    .locator('span', { hasText: new RegExp(`^${text}$`) })
    .last();
const currentFile = () => launched.page.locator('[data-current-file]');

beforeAll(async () => {
  repo = createE2eRepo();
  launched = await launchApp();
  const project = await callApi<{ id: string }>(launched.page, 'POST', '/projects', { rootPath: repo });
  const target = await callApi<{ key: string }>(launched.page, 'POST', '/targets/resolve', {
    target: { kind: 'local-worktree', projectId: project.id },
  });
  targetKey = target.key;
  await launched.page.evaluate((key) => (location.hash = `#/review/${encodeURIComponent(key)}`), targetKey);
  await launched.page.getByText('calc.ts', { exact: true }).waitFor();
});

afterAll(async () => {
  await launched?.app.close();
});

describe('ローカル差分のレビュー', () => {
  it('実装とテストをグループ分けし、依存の葉（math.ts）から並べる', async () => {
    const { page } = launched;
    const impl = page.locator('section', { hasText: '実装' }).first().locator('li');
    await expect
      .poll(async () => (await impl.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim()))
      .toEqual([expect.stringContaining('math.ts'), expect.stringContaining('calc.ts')]);
    await expect
      .poll(() => page.locator('section', { hasText: 'テスト' }).first().locator('li').count())
      .toBe(1);
  });

  it('Cmd+クリックで定義へジャンプし、Ctrl+- で戻れる', async () => {
    const { page } = launched;
    await page.getByText('calc.ts', { exact: true }).first().click();
    await diffToken('mul').waitFor();
    await expect.poll(() => page.getByText('TS ready').count(), { timeout: 30_000 }).toBe(1);
    await diffToken('mul').click({ modifiers: ['Meta'] });
    await expect.poll(() => currentFile().textContent(), { timeout: 15_000 }).toContain('src/math.ts');
    await page.keyboard.press('Control+Minus');
    await expect.poll(() => currentFile().textContent()).toContain('src/calc.ts');
  });

  it('⌥O で実装とテストを行き来できる', async () => {
    const { page } = launched;
    // 対応付けの解析が終わる前に押すと何も起きないので、先に終わるのを待つ
    await expect
      .poll(
        async () =>
          (
            await callApi<{ ready: boolean }>(
              page,
              'GET',
              `/targets/${encodeURIComponent(targetKey)}/test-links`,
            )
          ).ready,
      )
      .toBe(true);
    await page.getByText('math.ts', { exact: true }).first().click();
    await expect.poll(() => currentFile().textContent()).toContain('src/math.ts');
    await page.keyboard.press('Alt+KeyO');
    try {
      await expect.poll(() => currentFile().textContent(), { timeout: 5000 }).toContain('src/math.test.ts');
    } catch (error) {
      await page.screenshot({ path: '/tmp/tsugi-shots/e2e-alt-o.png' });
      console.log(
        'test-links',
        JSON.stringify(await callApi(page, 'GET', `/targets/${encodeURIComponent(targetKey)}/test-links`)),
      );
      console.log(
        'active',
        await page.evaluate(
          () => `${document.activeElement?.tagName} ${document.activeElement?.getAttribute('type')}`,
        ),
      );
      throw error;
    }
    await page.keyboard.press('Alt+KeyO');
    await expect.poll(() => currentFile().textContent()).toContain('src/math.ts');
  });

  it('Viewed を付けると永続化される', async () => {
    const { page } = launched;
    await page.keyboard.press('Meta+Alt+KeyV');
    await expect.poll(() => page.getByText('Viewed 1/3').count()).toBeGreaterThan(0);
    const viewed = await callApi<{ states: { path: string; state: string }[] }>(
      page,
      'GET',
      `/targets/${encodeURIComponent(targetKey)}/viewed`,
    );
    expect(viewed.states.find((s) => s.path === 'src/math.ts')?.state).toBe('viewed');
  });

  it('Viewed 後に変更されたファイルは「前回 Viewed から変更あり」になり、差分の差分を見られる', async () => {
    const { page } = launched;
    appendFileSync(path.join(repo, 'src/math.ts'), '\nexport const sub = (a: number, b: number) => a - b;\n');
    await expect
      .poll(async () => {
        const viewed = await callApi<{ states: { path: string; state: string }[] }>(
          page,
          'GET',
          `/targets/${encodeURIComponent(targetKey)}/viewed`,
        );
        return viewed.states.find((s) => s.path === 'src/math.ts')?.state;
      })
      .toBe('changed-since-viewed');
    await page.getByText('math.ts', { exact: true }).first().click();
    await page.getByText('前回 Viewed からの差分').click();
    // 差分の差分には、前回 Viewed 以降に追加した行だけが追加として出る
    await expect.poll(() => diffToken('sub').count()).toBeGreaterThan(0);
    await expect
      .poll(() => page.locator('diffs-container').locator('[data-line-type="change-addition"]').count())
      .toBeLessThan(6);
  });

  it('ファイルを保存すると一覧が自動で更新される', async () => {
    const { page } = launched;
    appendFileSync(path.join(repo, 'src/util.ts'), 'export const two = 2;\n');
    await expect
      .poll(() => page.getByText('util.ts', { exact: true }).count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  it('メモを追加できる', async () => {
    const { page } = launched;
    await page.getByText('calc.ts', { exact: true }).first().click();
    await diffToken('product').click();
    await page.keyboard.press('Meta+Alt+KeyM');
    const textarea = page.getByPlaceholder(/自分用のメモ/);
    await textarea.fill('mul の 0 件時の挙動を確認する');
    await textarea.press('Meta+Enter');
    await page.getByRole('tab', { name: 'メモ' }).click();
    await expect.poll(() => page.getByText('mul の 0 件時の挙動を確認する').count()).toBeGreaterThan(0);
  });

  it('Cmd+F でページ内を検索できる', async () => {
    const { page } = launched;
    await page.keyboard.press('Meta+KeyF');
    const input = page.getByPlaceholder('検索');
    await input.fill('product');
    await input.press('Enter');
    await input.press('Escape');
    await expect.poll(() => input.count()).toBe(0);
  });

  it('依存グラフに変更ファイルのノードが出る', async () => {
    const { page } = launched;
    await page.keyboard.press('Meta+Shift+KeyG');
    await expect
      .poll(() => page.locator('.react-flow__node').count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(3);
  });
});
