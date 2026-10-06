import { access, lstat, symlink } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';

import type { InstallError } from '../errors';
import type { Executables } from '../process/executables';
import { pathDirsOf } from '../process/executables';
import { spawnSafe } from '../process/spawn';

export type PackageManager = 'pnpm' | 'npm' | 'yarn';

const exists = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

export const detectPackageManager = async (dir: string): Promise<PackageManager | null> => {
  if (await exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(dir, 'package-lock.json'))) return 'npm';
  return null;
};

/** オフラインかつスクリプトなしの install コマンド（docs/adr/0014） */
export const installArgs = (pm: PackageManager): string[] => {
  switch (pm) {
    case 'pnpm':
      return [
        'install',
        '--frozen-lockfile',
        '--offline',
        '--ignore-scripts',
        '--config.confirmModulesPurge=false',
      ];
    case 'npm':
      return ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'];
    case 'yarn':
      return ['install', '--immutable', '--mode=skip-build'];
  }
};

export type InstallResult = { packageManager: PackageManager };

export const installDependencies = async (
  dir: string,
  executables: Executables,
  onLog: (line: string) => void,
): Result.ResultAsync<InstallResult, InstallError> => {
  const pm = await detectPackageManager(dir);
  if (!pm) return Result.fail({ type: 'install.noLockfile', path: dir });
  const executable = executables[pm];
  if (!executable) return Result.fail({ type: 'spawn.executableNotAllowed', executable: pm });
  let stderrTail = '';
  const result = await spawnSafe(executable, installArgs(pm), {
    cwd: dir,
    pathDirs: pathDirsOf(executables),
    extraEnv: { CI: '1', npm_config_ignore_scripts: 'true' },
    timeoutMs: 15 * 60_000,
    onStdout: (chunk) => {
      for (const line of chunk.split('\n')) if (line.trim()) onLog(line);
    },
    onStderr: (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-4000);
      for (const line of chunk.split('\n')) if (line.trim()) onLog(line);
    },
  });
  if (Result.isFailure(result)) return result;
  if (result.value.exitCode !== 0)
    return Result.fail({ type: 'install.failed', exitCode: result.value.exitCode, stderrTail });
  return Result.succeed({ packageManager: pm });
};

/** install に失敗したときのフォールバック。clone 本体の node_modules を symlink する */
export const symlinkNodeModules = async (fromRepo: string, toWorktree: string): Promise<boolean> => {
  const source = path.join(fromRepo, 'node_modules');
  const target = path.join(toWorktree, 'node_modules');
  if (!(await exists(source))) return false;
  try {
    await lstat(target);
    return true;
  } catch {
    await symlink(source, target, 'dir');
    return true;
  }
};
