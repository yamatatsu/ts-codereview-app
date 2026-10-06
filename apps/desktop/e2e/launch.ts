import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { _electron, type ElectronApplication, type Page } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

export type Launched = { app: ElectronApplication; page: Page; userData: string };

/** ビルド済みのアプリ（out/）を一時的な userData で起動する */
export const launchApp = async (env: Record<string, string> = {}): Promise<Launched> => {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'tsugi-e2e-data-'));
  // TSUGI_E2E_PACKAGED=1 ならパッケージ済みの .app を起動する
  const packaged = process.env['TSUGI_E2E_PACKAGED'] === '1';
  const app = await _electron.launch({
    executablePath: packaged
      ? path.join(root, 'release/mac-arm64/TSugi.app/Contents/MacOS/TSugi')
      : (require('electron') as unknown as string),
    args: packaged ? [] : [root],
    cwd: root,
    env: { ...process.env, ...env, TSUGI_USER_DATA: userData } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData };
};

/** renderer から内部 API を叩く（テストの準備用） */
export const callApi = <T>(page: Page, method: string, url: string, body?: unknown): Promise<T> =>
  page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(`app://tsugi/api${u}`, {
        method: m,
        headers: { 'content-type': 'application/json' },
        ...(b === undefined ? {} : { body: JSON.stringify(b) }),
      });
      return res.json();
    },
    [method, url, body] as const,
  ) as Promise<T>;
