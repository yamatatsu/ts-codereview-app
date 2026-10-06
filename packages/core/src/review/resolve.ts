import { Result } from '@praha/byethrow';

import type { GitError } from '../errors';
import type { GitClient } from '../git/client';
import { createClassifier } from './classify';
import { WORKTREE, targetKey, type ChangedFile, type ResolvedTarget, type ReviewTarget } from './target';

export type ProjectLike = {
  id: string;
  rootPath: string;
  collapsedGlobs: readonly string[];
  testGlobs: readonly string[];
};

export type RevRange = {
  repoPath: string;
  workspacePath: string;
  baseRev: string;
  /** WORKTREE なら作業ツリー */
  headRev: string;
};

/** base..head（または作業ツリー）の変更ファイルを列挙して分類する */
export const collectChangedFiles = async (
  git: GitClient,
  range: RevRange,
  project: ProjectLike,
): Result.ResultAsync<ChangedFile[], GitError> => {
  const isWorktree = range.headRev === WORKTREE;
  const diff = await git.diffNameStatus(
    range.workspacePath,
    range.baseRev,
    isWorktree ? null : range.headRev,
  );
  if (Result.isFailure(diff)) return diff;
  const entries = [...diff.value];

  if (isWorktree) {
    const untracked = await git.lsFilesOthers(range.workspacePath);
    if (Result.isFailure(untracked)) return untracked;
    const known = new Set(entries.map((e) => e.path));
    for (const file of untracked.value) if (!known.has(file)) entries.push({ status: 'A', path: file });
  }

  const allPaths = entries.map((e) => e.path);
  const generated = await git.checkAttr(range.workspacePath, 'linguist-generated', allPaths);
  if (Result.isFailure(generated)) return generated;
  const classify = createClassifier({
    collapsedGlobs: project.collapsedGlobs,
    testGlobs: project.testGlobs,
    generated: generated.value,
  });

  const basePaths = entries.filter((e) => e.status !== 'A').map((e) => e.oldPath ?? e.path);
  const baseBlobs = await git.lsTreeBlobs(range.workspacePath, range.baseRev, basePaths);
  if (Result.isFailure(baseBlobs)) return baseBlobs;

  const headPaths = entries.filter((e) => e.status !== 'D').map((e) => e.path);
  const headBlobs = isWorktree
    ? await git.hashObjects(range.workspacePath, headPaths)
    : await git.lsTreeBlobs(range.workspacePath, range.headRev, headPaths);
  if (Result.isFailure(headBlobs)) return headBlobs;

  const files: ChangedFile[] = entries.map((entry) => {
    const file: ChangedFile = { path: entry.path, status: entry.status, kind: classify(entry.path) };
    if (entry.oldPath) file.oldPath = entry.oldPath;
    const baseBlob = baseBlobs.value.get(entry.oldPath ?? entry.path);
    if (baseBlob) file.baseBlob = baseBlob;
    const headBlob = headBlobs.value.get(entry.path);
    if (headBlob) file.headBlob = headBlob;
    return file;
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return Result.succeed(files);
};

/** ローカル差分の ReviewTarget を解決する。PR は worktree 側で解決する */
export const resolveLocalTarget = async (
  git: GitClient,
  project: ProjectLike,
  target: Exclude<ReviewTarget, { kind: 'pr' }>,
): Result.ResultAsync<ResolvedTarget, GitError> => {
  const warnings: string[] = [];
  let baseRev: string;
  let headRev: string;

  if (target.kind === 'local-worktree') {
    const head = await git.revParse(project.rootPath, 'HEAD');
    if (Result.isFailure(head)) return head;
    baseRev = head.value;
    headRev = WORKTREE;
  } else {
    const head = await git.revParse(project.rootPath, target.branch);
    if (Result.isFailure(head)) return head;
    const base = await git.mergeBase(project.rootPath, target.baseBranch, target.branch);
    if (Result.isFailure(base)) return base;
    baseRev = base.value;
    headRev = head.value;
    const current = await git.currentBranch(project.rootPath);
    if (Result.isSuccess(current) && current.value !== target.branch) {
      warnings.push(
        `ブランチ ${target.branch} はチェックアウトされていません。コードジャンプは作業ツリーの内容に基づきます。`,
      );
    }
  }

  const range: RevRange = { repoPath: project.rootPath, workspacePath: project.rootPath, baseRev, headRev };
  const files = await collectChangedFiles(git, range, project);
  if (Result.isFailure(files)) return files;
  return Result.succeed({
    key: targetKey(target),
    target,
    baseRev,
    headRev,
    workspacePath: project.rootPath,
    repoPath: project.rootPath,
    files: files.value,
    warnings,
  });
};
