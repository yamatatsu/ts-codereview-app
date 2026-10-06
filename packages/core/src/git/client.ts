import path from 'node:path';

import { Result } from '@praha/byethrow';

import type { GitError } from '../errors';
import { spawnSafe } from '../process/spawn';
import {
  parseCheckAttrZ,
  parseLsTreeZ,
  parseNameStatusZ,
  parseNulList,
  parseWorktreeListPorcelain,
  type NameStatusEntry,
  type WorktreeEntry,
} from './parse';

export type GitClientOptions = {
  gitPath: string;
  pathDirs?: readonly string[];
};

export type RunOptions = {
  /** 一時的に渡す git 設定（`-c key=value`）。ログには出さない */
  configs?: readonly string[];
  binary?: boolean;
  allowExitCodes?: readonly number[];
  onStderr?: (chunk: string) => void;
  timeoutMs?: number;
};

const FIXED_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
};

/** システムの git CLI の薄いラッパー（docs/adr/0012） */
export class GitClient {
  readonly #gitPath: string;
  readonly #pathDirs: readonly string[];

  constructor(options: GitClientOptions) {
    this.#gitPath = options.gitPath;
    this.#pathDirs = options.pathDirs ?? [path.dirname(options.gitPath)];
  }

  async runRaw(
    cwd: string,
    args: readonly string[],
    options: RunOptions = {},
  ): Result.ResultAsync<{ stdout: string; stdoutBuffer: Buffer; exitCode: number }, GitError> {
    const configArgs = (options.configs ?? []).flatMap((c) => ['-c', c]);
    const result = await spawnSafe(this.#gitPath, [...configArgs, ...args], {
      cwd,
      pathDirs: this.#pathDirs,
      extraEnv: FIXED_ENV,
      timeoutMs: options.timeoutMs ?? 120_000,
      ...(options.binary ? { binary: true } : {}),
      ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    });
    if (Result.isFailure(result)) return result;
    const { exitCode, stderr, stdout, stdoutBuffer } = result.value;
    if (exitCode !== 0 && !(options.allowExitCodes ?? []).includes(exitCode)) {
      if (/not a git repository/i.test(stderr)) return Result.fail({ type: 'git.notARepository', path: cwd });
      return Result.fail({ type: 'git.commandFailed', args, exitCode, stderr: stderr.trim() });
    }
    return Result.succeed({ stdout, stdoutBuffer, exitCode });
  }

  async run(
    cwd: string,
    args: readonly string[],
    options: RunOptions = {},
  ): Result.ResultAsync<string, GitError> {
    const result = await this.runRaw(cwd, args, options);
    return Result.isFailure(result) ? result : Result.succeed(result.value.stdout);
  }

  async showToplevel(cwd: string): Result.ResultAsync<string, GitError> {
    const result = await this.run(cwd, ['rev-parse', '--show-toplevel']);
    return Result.isFailure(result) ? result : Result.succeed(result.value.trim());
  }

  async revParse(cwd: string, rev: string): Result.ResultAsync<string, GitError> {
    const result = await this.run(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], {
      allowExitCodes: [1],
    });
    if (Result.isFailure(result)) return result;
    const sha = result.value.trim();
    return sha ? Result.succeed(sha) : Result.fail({ type: 'git.revisionNotFound', rev });
  }

  async currentBranch(cwd: string): Result.ResultAsync<string | null, GitError> {
    const result = await this.run(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      allowExitCodes: [1],
    });
    if (Result.isFailure(result)) return result;
    const name = result.value.trim();
    return Result.succeed(name || null);
  }

  async listBranches(cwd: string): Result.ResultAsync<string[], GitError> {
    const result = await this.run(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    if (Result.isFailure(result)) return result;
    return Result.succeed(result.value.split('\n').filter(Boolean));
  }

  async remoteUrl(cwd: string, remote = 'origin'): Result.ResultAsync<string | null, GitError> {
    const result = await this.run(cwd, ['remote', 'get-url', remote], { allowExitCodes: [2, 128] });
    if (Result.isFailure(result)) return result;
    return Result.succeed(result.value.trim() || null);
  }

  /** `origin/HEAD` から既定のベースブランチを推定する */
  async defaultBaseBranch(cwd: string): Result.ResultAsync<string, GitError> {
    const result = await this.run(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
      allowExitCodes: [1, 128],
    });
    if (Result.isFailure(result)) return result;
    const ref = result.value.trim();
    if (ref) return Result.succeed(ref.replace(/^origin\//, ''));
    const branches = await this.listBranches(cwd);
    if (Result.isFailure(branches)) return branches;
    return Result.succeed(branches.value.find((b) => b === 'main' || b === 'master') ?? 'main');
  }

  async mergeBase(cwd: string, a: string, b: string): Result.ResultAsync<string, GitError> {
    const result = await this.run(cwd, ['merge-base', a, b]);
    return Result.isFailure(result) ? result : Result.succeed(result.value.trim());
  }

  /** head が null のときは作業ツリーとの差分 */
  async diffNameStatus(
    cwd: string,
    base: string,
    head: string | null,
  ): Result.ResultAsync<NameStatusEntry[], GitError> {
    const args = ['diff', '--name-status', '-M', '-z', '--no-color', '--no-ext-diff', base];
    if (head) args.push(head);
    args.push('--');
    const result = await this.run(cwd, args);
    return Result.isFailure(result) ? result : Result.succeed(parseNameStatusZ(result.value));
  }

  async lsFilesOthers(cwd: string): Result.ResultAsync<string[], GitError> {
    const result = await this.run(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
    return Result.isFailure(result) ? result : Result.succeed(parseNulList(result.value));
  }

  /** 追跡中のファイル一覧（rev を指定するとそのツリー） */
  async lsFiles(cwd: string, rev?: string): Result.ResultAsync<string[], GitError> {
    const args = rev
      ? ['ls-tree', '-r', '-z', '--name-only', rev]
      : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
    const result = await this.run(cwd, args);
    return Result.isFailure(result) ? result : Result.succeed([...new Set(parseNulList(result.value))]);
  }

  async showFile(cwd: string, rev: string, file: string): Result.ResultAsync<Buffer, GitError> {
    const result = await this.runRaw(cwd, ['show', `${rev}:${file}`], { binary: true });
    return Result.isFailure(result) ? result : Result.succeed(result.value.stdoutBuffer);
  }

  async catBlob(cwd: string, sha: string): Result.ResultAsync<Buffer, GitError> {
    const result = await this.runRaw(cwd, ['cat-file', 'blob', sha], { binary: true });
    return Result.isFailure(result) ? result : Result.succeed(result.value.stdoutBuffer);
  }

  async lsTreeBlobs(
    cwd: string,
    rev: string,
    files: readonly string[],
  ): Result.ResultAsync<Map<string, string>, GitError> {
    if (files.length === 0) return Result.succeed(new Map());
    const result = await this.run(cwd, ['ls-tree', '-z', rev, '--', ...files]);
    return Result.isFailure(result) ? result : Result.succeed(parseLsTreeZ(result.value));
  }

  /** 作業ツリー上のファイルの blob SHA を計算する（DB には書き込まない） */
  async hashObjects(
    cwd: string,
    files: readonly string[],
  ): Result.ResultAsync<Map<string, string>, GitError> {
    if (files.length === 0) return Result.succeed(new Map());
    const result = await this.run(cwd, ['hash-object', '--', ...files]);
    if (Result.isFailure(result)) return result;
    const shas = result.value.split('\n').filter(Boolean);
    return Result.succeed(new Map(files.map((f, i) => [f, shas[i] ?? ''])));
  }

  async checkAttr(
    cwd: string,
    attr: string,
    files: readonly string[],
  ): Result.ResultAsync<Set<string>, GitError> {
    if (files.length === 0) return Result.succeed(new Set());
    const result = await this.run(cwd, ['check-attr', '-z', attr, '--', ...files]);
    return Result.isFailure(result) ? result : Result.succeed(parseCheckAttrZ(result.value));
  }

  async fetch(
    cwd: string,
    remote: string,
    refspecs: readonly string[],
    options: { configs?: readonly string[]; onStderr?: (chunk: string) => void } = {},
  ): Result.ResultAsync<void, GitError> {
    const result = await this.run(cwd, ['fetch', '--no-tags', '--force', remote, ...refspecs], {
      ...options,
      timeoutMs: 600_000,
    });
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async worktreeAdd(cwd: string, dir: string, rev: string): Result.ResultAsync<void, GitError> {
    const result = await this.run(cwd, ['worktree', 'add', '--detach', dir, rev]);
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async worktreeRemove(cwd: string, dir: string): Result.ResultAsync<void, GitError> {
    const result = await this.run(cwd, ['worktree', 'remove', '--force', dir]);
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async worktreePrune(cwd: string): Result.ResultAsync<void, GitError> {
    const result = await this.run(cwd, ['worktree', 'prune']);
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async worktreeList(cwd: string): Result.ResultAsync<WorktreeEntry[], GitError> {
    const result = await this.run(cwd, ['worktree', 'list', '--porcelain']);
    return Result.isFailure(result) ? result : Result.succeed(parseWorktreeListPorcelain(result.value));
  }

  async checkoutDetach(worktreeDir: string, rev: string): Result.ResultAsync<void, GitError> {
    const result = await this.run(worktreeDir, ['checkout', '--detach', '--force', rev]);
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async deleteRef(cwd: string, ref: string): Result.ResultAsync<void, GitError> {
    const result = await this.run(cwd, ['update-ref', '-d', ref], { allowExitCodes: [1] });
    return Result.isFailure(result) ? result : Result.succeed();
  }

  async version(cwd: string): Result.ResultAsync<string, GitError> {
    const result = await this.run(cwd, ['--version']);
    return Result.isFailure(result) ? result : Result.succeed(result.value.trim());
  }
}
