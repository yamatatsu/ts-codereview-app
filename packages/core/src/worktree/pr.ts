import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';

import type { GitError } from '../errors';
import type { GitClient } from '../git/client';
import { authHeaderConfig, maskSecrets } from '../github/remote';

export const prHeadRef = (n: number) => `refs/tsugi/pr-${n}`;
export const prBaseRef = (n: number) => `refs/tsugi/pr-${n}-base`;

export type PreparePrOptions = {
  git: GitClient;
  repoPath: string;
  remote: string;
  prNumber: number;
  baseBranch: string;
  worktreeDir: string;
  /** PAT。fetch の間だけ http.extraHeader として渡す */
  token?: string;
  onLog?: (line: string) => void;
};

export type PreparedPr = { headRev: string; baseRev: string; worktreeDir: string; created: boolean };

/** PR の head と base を fetch し、worktree を作成または更新する（docs/adr/0014） */
export const preparePrWorktree = async (
  options: PreparePrOptions,
): Result.ResultAsync<PreparedPr, GitError> => {
  const { git, repoPath, remote, prNumber, baseBranch, worktreeDir, token, onLog } = options;
  onLog?.(`fetch ${remote} pull/${prNumber}/head`);
  const fetched = await git.fetch(
    repoPath,
    remote,
    [
      `+refs/pull/${prNumber}/head:${prHeadRef(prNumber)}`,
      `+refs/heads/${baseBranch}:${prBaseRef(prNumber)}`,
    ],
    {
      configs: token ? [authHeaderConfig(token)] : [],
      ...(onLog ? { onStderr: (chunk: string) => onLog(maskSecrets(chunk.trim())) } : {}),
    },
  );
  if (Result.isFailure(fetched)) {
    if (fetched.error.type === 'git.commandFailed') {
      return Result.fail({ ...fetched.error, stderr: maskSecrets(fetched.error.stderr) });
    }
    return fetched;
  }

  const headRev = await git.revParse(repoPath, prHeadRef(prNumber));
  if (Result.isFailure(headRev)) return headRev;
  const baseTip = await git.revParse(repoPath, prBaseRef(prNumber));
  if (Result.isFailure(baseTip)) return baseTip;
  const baseRev = await git.mergeBase(repoPath, baseTip.value, headRev.value);
  if (Result.isFailure(baseRev)) return baseRev;

  const worktrees = await git.worktreeList(repoPath);
  if (Result.isFailure(worktrees)) return worktrees;
  const resolvedDir = path.resolve(worktreeDir);
  const existing = worktrees.value.some((w) => path.resolve(w.path) === resolvedDir);

  if (existing) {
    onLog?.(`checkout ${headRev.value.slice(0, 8)}`);
    const checkout = await git.checkoutDetach(resolvedDir, headRev.value);
    if (Result.isFailure(checkout)) return checkout;
  } else {
    await mkdir(path.dirname(resolvedDir), { recursive: true });
    await git.worktreePrune(repoPath);
    onLog?.(`worktree add ${resolvedDir}`);
    const added = await git.worktreeAdd(repoPath, resolvedDir, headRev.value);
    if (Result.isFailure(added)) return added;
  }
  return Result.succeed({
    headRev: headRev.value,
    baseRev: baseRev.value,
    worktreeDir: resolvedDir,
    created: !existing,
  });
};

export const removePrWorktree = async (
  git: GitClient,
  repoPath: string,
  prNumber: number,
  worktreeDir: string,
): Result.ResultAsync<void, GitError> => {
  const removed = await git.worktreeRemove(repoPath, worktreeDir);
  if (Result.isFailure(removed) && removed.error.type !== 'git.commandFailed') return removed;
  await git.worktreePrune(repoPath);
  await git.deleteRef(repoPath, prHeadRef(prNumber));
  await git.deleteRef(repoPath, prBaseRef(prNumber));
  return Result.succeed();
};
