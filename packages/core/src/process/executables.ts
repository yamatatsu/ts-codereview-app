import { access, constants } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Result } from '@praha/byethrow';

import { spawnSafe } from './spawn';

export const EXECUTABLE_NAMES = ['git', 'node', 'pnpm', 'npm', 'yarn', 'code', 'cursor'] as const;
export type ExecutableName = (typeof EXECUTABLE_NAMES)[number];

export type Executables = { [K in ExecutableName]?: string | undefined };

export type DetectedExecutable = {
  name: ExecutableName;
  path: string | null;
  version: string | null;
};

/** ログインシェルは使わず、固定の候補ディレクトリだけを探す（docs/adr/0016） */
export const candidateDirectories = (home: string = os.homedir()): string[] => [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  // Vite+ の shim（プロジェクトごとに Node と pnpm のバージョンを選ぶ）
  path.join(home, '.local/share/vite-plus/bin'),
  path.join(home, '.vite-plus/bin'),
  path.join(home, '.local/bin'),
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin',
  '/Applications/Cursor.app/Contents/Resources/app/bin',
  '/usr/bin',
];

const isExecutable = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const detectExecutable = async (
  name: ExecutableName,
  dirs: readonly string[] = candidateDirectories(),
): Promise<DetectedExecutable> => {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (!(await isExecutable(candidate))) continue;
    const version = await readVersion(candidate, dirs);
    if (version !== null || name === 'code' || name === 'cursor') {
      return { name, path: candidate, version };
    }
  }
  return { name, path: null, version: null };
};

export const readVersion = async (
  executable: string,
  pathDirs: readonly string[],
): Promise<string | null> => {
  const result = await spawnSafe(executable, ['--version'], {
    cwd: os.tmpdir(),
    pathDirs: [path.dirname(executable), ...pathDirs],
    timeoutMs: 10_000,
  });
  if (Result.isFailure(result) || result.value.exitCode !== 0) return null;
  return result.value.stdout.trim().split('\n')[0] ?? null;
};

export const detectExecutables = async (
  dirs: readonly string[] = candidateDirectories(),
): Promise<DetectedExecutable[]> => Promise.all(EXECUTABLE_NAMES.map((name) => detectExecutable(name, dirs)));

/** 設定済みの実行ファイル群から、子プロセスに渡す PATH のディレクトリを組み立てる */
export const pathDirsOf = (executables: Executables): string[] => [
  ...new Set(
    Object.values(executables)
      .filter((value): value is string => typeof value === 'string')
      .map((file) => path.dirname(file)),
  ),
];
