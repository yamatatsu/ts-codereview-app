import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { createRepositories, openDatabase, resolveBundledTscPath, detectExecutables } from '@tsugi/core';
import { app, BrowserWindow, shell } from 'electron';

import { APP_ORIGIN, createApi } from './api/app';
import { EventBus } from './event-bus';
import { Logger } from './logger';
import { appPaths } from './paths';
import { handleAppProtocol, registerAppScheme } from './protocol';
import { AnalysisHost } from './services/analysis-host';
import type { AppContext } from './services/context';
import { LspManager } from './services/lsp-manager';
import { TargetService } from './services/targets';
import { sweepWorktrees } from './services/worktrees';
import { SettingsStore } from './settings-store';

const DEV_SERVER_URL = process.env['TSUGI_DEV_SERVER_URL'] ?? null;
const isDev = DEV_SERVER_URL !== null;

registerAppScheme();
app.setName('TSugi');
// E2E テストなどで userData の場所を差し替える
if (process.env['TSUGI_USER_DATA']) app.setPath('userData', process.env['TSUGI_USER_DATA']);

const outDir = import.meta.dirname;

/** 同梱した TypeScript 7 の tsc。パッケージ後は asar 外（app.asar.unpacked）のバイナリを使う */
const tscPath = async (): Promise<string> => {
  const resolved = await resolveBundledTscPath(app.getAppPath());
  return resolved.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
};

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'TSugi',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: {
      preload: path.join(outDir, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  const allowedOrigins = new Set([APP_ORIGIN, ...(DEV_SERVER_URL ? [new URL(DEV_SERVER_URL).origin] : [])]);
  // app:// と dev server 以外へのナビゲーション・window.open は拒否する（docs/adr/0016）
  win.webContents.on('will-navigate', (event, url) => {
    if (!allowedOrigins.has(new URL(url).origin)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(DEV_SERVER_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
};

const bootstrap = async (): Promise<void> => {
  const paths = appPaths();
  mkdirSync(paths.userData, { recursive: true });
  const logger = new Logger(paths.logs, 'main');
  logger.info('starting TSugi', {
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
  });

  const settings = new SettingsStore(paths.settings);
  // 初回は実行ファイルを自動検出して保存する（ログインシェルは使わない）
  if (!settings.get().executables.git) {
    const detected = await detectExecutables();
    const executables = Object.fromEntries(
      detected.filter((d) => d.path).map((d) => [d.name, d.path as string]),
    );
    settings.update({ executables: { ...executables, ...settings.get().executables } });
    logger.info('executables detected', executables);
  }

  const database = openDatabase(paths.database);
  const bus = new EventBus();
  const analysis = new AnalysisHost(path.join(outDir, '../analysis/index.js'), logger);
  const lsp = new LspManager(tscPath, bus, logger);
  const ctx: AppContext = {
    paths,
    logger,
    bus,
    settings,
    repos: createRepositories(database.db),
    analysis,
    lsp,
    isDev,
  };
  const gitPath = settings.get().executables.git;
  if (gitPath) analysis.start(gitPath);

  const targets = new TargetService(ctx);
  const api = createApi(ctx, targets, DEV_SERVER_URL ? new URL(DEV_SERVER_URL).origin : null);
  handleAppProtocol(api, isDev ? null : path.join(outDir, '../renderer'));

  createWindow();
  setTimeout(
    () =>
      void sweepWorktrees(ctx, targets).catch((e: unknown) => logger.warn('sweep failed', { e: String(e) })),
    5000,
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('before-quit', () => {
    void lsp.dispose();
    analysis.stop();
    database.close();
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(bootstrap, (error: unknown) => {
  console.error(error);
  app.quit();
});
