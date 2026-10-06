/**
 * 開発用ランチャー（docs/adr/0004）。
 * - renderer: Vite の dev server
 * - main / analysis / preload: tsdown の watch
 * - Electron: ビルド出力の変更を検知して再起動する
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;
const vp = path.join(root, 'node_modules/.bin/vp');
const DEV_URL = 'http://localhost:5199';

const children: ChildProcess[] = [];

/** 行頭にプレフィックスを付ける（チャンク末尾の改行の後には付けない） */
const prefixLines = (text: string, prefix: string) => text.replace(/^(?=.)/gm, prefix);

const run = (name: string, command: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
  // 孫プロセス（vp が起動する node）ごと止められるよう、プロセスグループを分ける
  const child = spawn(command, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    detached: true,
  });
  const prefix = `[${name}] `;
  child.stdout?.on('data', (d: Buffer) => process.stdout.write(prefixLines(d.toString(), prefix)));
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(prefixLines(d.toString(), prefix)));
  children.push(child);
  return child;
};

const killGroup = (child: ChildProcess) => {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
};

run('renderer', vp, ['dev']);
run('pack', vp, ['pack', '--watch']);

let electron: ChildProcess | undefined;
let restarting = false;
const startElectron = () => {
  electron = run('electron', electronPath, ['.'], { TSUGI_DEV_SERVER_URL: DEV_URL });
  electron.on('exit', (code) => {
    if (!restarting) {
      shutdown(code ?? 0);
    }
  });
};
const restartElectron = () => {
  if (!electron) return startElectron();
  restarting = true;
  electron.once('exit', () => {
    restarting = false;
    startElectron();
  });
  killGroup(electron);
};

const outputs = ['out/main/index.js', 'out/analysis/index.js', 'out/preload/index.cjs'].map((f) =>
  path.join(root, f),
);
const waitForBuild = async () => {
  while (!outputs.every((f) => existsSync(f))) await new Promise((r) => setTimeout(r, 300));
};

let timer: NodeJS.Timeout | undefined;
await waitForBuild();
startElectron();
for (const dir of ['out/main', 'out/analysis', 'out/preload']) {
  watch(path.join(root, dir), () => {
    clearTimeout(timer);
    timer = setTimeout(restartElectron, 400);
  });
}

function shutdown(code: number) {
  for (const child of children) killGroup(child);
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
