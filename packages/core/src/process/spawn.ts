// oxlint-disable-next-line no-restricted-imports -- spawnSafe は子プロセス起動の唯一の入口（docs/adr/0016）
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import { Result } from '@praha/byethrow';

import { errorMessage, type SpawnError } from '../errors';

/** 子プロセスへ引き継いでよい環境変数（許可リスト） */
const INHERITED_ENV_KEYS = ['HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'USER'] as const;

export type SpawnOptions = {
  cwd: string;
  /** 子プロセスの PATH に入れるディレクトリ（設定済みの実行ファイルのディレクトリから組み立てる） */
  pathDirs?: readonly string[];
  /** 許可リストに加えて明示的に渡す環境変数 */
  extraEnv?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  stdin?: string;
  /** stdout をバイナリのまま受け取る */
  binary?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
};

export type SpawnOutput = {
  stdout: string;
  stdoutBuffer: Buffer;
  stderr: string;
  exitCode: number;
};

export const buildChildEnv = (
  source: NodeJS.ProcessEnv,
  pathDirs: readonly string[],
  extraEnv: Readonly<Record<string, string>> = {},
): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  env['PATH'] = [...new Set([...pathDirs, '/usr/bin', '/bin'])].join(path.delimiter);
  return { ...env, ...extraEnv };
};

const assertExecutable = (executable: string): Result.Result<string, SpawnError> =>
  path.isAbsolute(executable)
    ? Result.succeed(executable)
    : Result.fail({ type: 'spawn.executableNotAllowed', executable });

/**
 * 子プロセスを安全に起動して完了を待つ。
 * - 実行ファイルは絶対パスのみ
 * - shell は使わない
 * - 環境変数は許可リスト方式
 */
export const spawnSafe = async (
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
): Result.ResultAsync<SpawnOutput, SpawnError> => {
  const checked = assertExecutable(executable);
  if (Result.isFailure(checked)) return checked;

  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(executable, args, {
        cwd: options.cwd,
        env: buildChildEnv(process.env, options.pathDirs ?? [path.dirname(executable)], options.extraEnv),
        shell: false,
        stdio: 'pipe',
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      resolve(Result.fail({ type: 'spawn.failedToStart', executable, message: errorMessage(error) }));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      options.onStdout?.(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      options.onStderr?.(chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve(Result.fail({ type: 'spawn.failedToStart', executable, message: error.message }));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        resolve(Result.fail({ type: 'spawn.timeout', executable, args }));
        return;
      }
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      resolve(
        Result.succeed({
          stdout: options.binary ? '' : stdoutBuffer.toString('utf8'),
          stdoutBuffer,
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: code ?? -1,
        }),
      );
    });

    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
};

export type LongRunningProcess = {
  child: ChildProcessWithoutNullStreams;
};

/** LSP サーバーなど、常駐させる子プロセスを起動する（stdio を呼び出し側で扱う） */
export const spawnLongRunning = (
  executable: string,
  args: readonly string[],
  options: Pick<SpawnOptions, 'cwd' | 'pathDirs' | 'extraEnv'>,
): Result.Result<LongRunningProcess, SpawnError> => {
  const checked = assertExecutable(executable);
  if (Result.isFailure(checked)) return checked;
  return Result.try({
    try: () => ({
      child: spawn(executable, args, {
        cwd: options.cwd,
        env: buildChildEnv(process.env, options.pathDirs ?? [path.dirname(executable)], options.extraEnv),
        shell: false,
        stdio: 'pipe',
      }),
    }),
    catch: (error): SpawnError => ({ type: 'spawn.failedToStart', executable, message: errorMessage(error) }),
  });
};
