import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import { removePrWorktree, targetKey, type AppError } from '@tsugi/core';

import type { PullListItemDto, WorktreeDto } from '../../shared/dto';
import { gitClientOf, type AppContext } from './context';
import { getProject, githubAccessOf } from './projects';
import type { TargetService } from './targets';

const DAY = 24 * 60 * 60 * 1000;

/** ディレクトリサイズ（node_modules の hardlink は重複して数える。目安表示用） */
const dirSize = async (dir: string, budget = { files: 50_000 }): Promise<number> => {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (budget.files-- <= 0) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full, budget);
    else if (entry.isFile()) total += (await stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
};

export const listWorktrees = async (ctx: AppContext, withSize: boolean): Promise<WorktreeDto[]> => {
  const rows = await ctx.repos.prWorktrees.list();
  const projects = new Map((await ctx.repos.projects.list()).map((p) => [p.id, p]));
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: projects.get(row.projectId)?.name ?? '(unknown)',
      prNumber: row.prNumber,
      path: row.path,
      headSha: row.headSha,
      installStatus: row.installStatus,
      lastOpenedAt: row.lastOpenedAt,
      sizeBytes: withSize ? await dirSize(row.path) : null,
    })),
  );
};

export const deleteWorktree = async (
  ctx: AppContext,
  targets: TargetService,
  id: string,
): Result.ResultAsync<void, AppError> => {
  const row = await ctx.repos.prWorktrees.getById(id);
  if (!row) return Result.fail({ type: 'notFound', resource: 'worktree', id });
  const project = await getProject(ctx, row.projectId);
  if (Result.isFailure(project)) return project;
  const git = gitClientOf(ctx);
  if (!git) return Result.fail({ type: 'spawn.executableNotAllowed', executable: 'git' });
  await ctx.lsp.stop(row.path);
  await ctx.analysis.request('workspace.close', { workspace: row.path }).catch(() => null);
  const removed = await removePrWorktree(git, project.value.rootPath, row.prNumber, row.path);
  if (Result.isFailure(removed)) return removed;
  await ctx.repos.prWorktrees.delete(row.id);
  targets.invalidate(targetKey({ kind: 'pr', projectId: row.projectId, number: row.prNumber }));
  ctx.logger.info('worktree removed', { id, path: row.path });
  return Result.succeed();
};

/** merged / closed の PR の worktree を削除し、古いものを通知する（docs/specs/07） */
export const sweepWorktrees = async (
  ctx: AppContext,
  targets: TargetService,
  projectId?: string,
): Promise<void> => {
  const rows = projectId
    ? await ctx.repos.prWorktrees.listByProject(projectId)
    : await ctx.repos.prWorktrees.list();
  const staleDays = ctx.settings.get().worktreeStaleDays;
  for (const row of rows) {
    const project = await ctx.repos.projects.get(row.projectId);
    if (!project) continue;
    const access = githubAccessOf(project);
    if (Result.isSuccess(access)) {
      const pull = await access.value.client.getPull(row.prNumber);
      if (Result.isSuccess(pull) && pull.value.state === 'closed') {
        await deleteWorktree(ctx, targets, row.id);
        continue;
      }
    }
    const days = Math.floor((Date.now() - row.lastOpenedAt) / DAY);
    if (days >= staleDays) {
      ctx.bus.emit({
        type: 'worktree.stale',
        worktreeId: row.id,
        projectId: row.projectId,
        prNumber: row.prNumber,
        days,
      });
    }
  }
};

export const listPulls = async (
  ctx: AppContext,
  targets: TargetService,
  projectId: string,
): Result.ResultAsync<PullListItemDto[], AppError> => {
  const project = await getProject(ctx, projectId);
  if (Result.isFailure(project)) return project;
  const access = githubAccessOf(project.value);
  if (Result.isFailure(access)) return access;
  const pulls = await access.value.client.listPulls();
  if (Result.isFailure(pulls)) return pulls;

  // 開いたことのある PR の head が進んでいれば通知する
  for (const row of await ctx.repos.prWorktrees.listByProject(projectId)) {
    const pull = pulls.value.find((p) => p.number === row.prNumber);
    if (pull && pull.headSha !== row.headSha) {
      ctx.bus.emit({
        type: 'pr.headChanged',
        targetKey: targetKey({ kind: 'pr', projectId, number: row.prNumber }),
        newHeadSha: pull.headSha,
      });
    }
  }
  void sweepWorktrees(ctx, targets, projectId);
  return Result.succeed(
    pulls.value.map(({ number, title, author, headRef, baseRef, updatedAt, draft }) => ({
      number,
      title,
      author,
      headRef,
      baseRef,
      updatedAt,
      draft,
    })),
  );
};
