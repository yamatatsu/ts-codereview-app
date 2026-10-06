import path from 'node:path';

import { Result } from '@praha/byethrow';
import {
  DEFAULT_COLLAPSED_GLOBS,
  DEFAULT_TEST_GLOBS,
  formatRepoRef,
  GitHubClient,
  parseGitHubRemote,
  parseRepoRef,
  type AppError,
  type GitHubError,
  type ProjectRow,
} from '@tsugi/core';

import type { ProjectDto } from '../../shared/dto';
import { decryptSecret, encryptSecret } from '../secrets';
import { gitClientOf, type AppContext } from './context';

/** E2E テスト用に GitHub API のベース URL を差し替える（本番では未設定） */
const githubApiOptions = (): { baseUrl?: string } =>
  process.env['TSUGI_GITHUB_API_URL'] ? { baseUrl: process.env['TSUGI_GITHUB_API_URL'] } : {};

export const toProjectDto = (row: ProjectRow): ProjectDto => ({
  id: row.id,
  name: row.name,
  rootPath: row.rootPath,
  defaultBaseBranch: row.defaultBaseBranch,
  githubRemote: row.githubRemote,
  hasPat: row.encryptedPat !== null && row.encryptedPat.length > 0,
  collapsedGlobs: row.collapsedGlobs,
  testGlobs: row.testGlobs,
  lastOpenedAt: row.lastOpenedAt,
});

const gitMissing = (): AppError => ({ type: 'spawn.executableNotAllowed', executable: 'git' });

export const listProjects = async (ctx: AppContext): Promise<ProjectDto[]> =>
  (await ctx.repos.projects.list()).map(toProjectDto);

export const getProject = async (ctx: AppContext, id: string): Result.ResultAsync<ProjectRow, AppError> => {
  const row = await ctx.repos.projects.get(id);
  return row ? Result.succeed(row) : Result.fail({ type: 'notFound', resource: 'project', id });
};

export const registerProject = async (
  ctx: AppContext,
  rootPath: string,
): Result.ResultAsync<ProjectDto, AppError> => {
  const git = gitClientOf(ctx);
  if (!git) return Result.fail(gitMissing());
  const top = await git.showToplevel(rootPath);
  if (Result.isFailure(top)) return top;
  const existing = await ctx.repos.projects.findByRootPath(top.value);
  if (existing) return Result.succeed(toProjectDto(existing));

  const base = await git.defaultBaseBranch(top.value);
  const remote = await git.remoteUrl(top.value);
  const repoRef = Result.isSuccess(remote) && remote.value ? parseGitHubRemote(remote.value) : null;
  const { defaultCollapsedGlobs, defaultTestGlobs } = ctx.settings.get();
  const row = await ctx.repos.projects.create({
    name: path.basename(top.value),
    rootPath: top.value,
    defaultBaseBranch: Result.isSuccess(base) ? base.value : 'main',
    githubRemote: repoRef ? formatRepoRef(repoRef) : null,
    collapsedGlobs: defaultCollapsedGlobs ?? [...DEFAULT_COLLAPSED_GLOBS],
    testGlobs: defaultTestGlobs ?? [...DEFAULT_TEST_GLOBS],
  });
  ctx.logger.info('project registered', { id: row.id, rootPath: row.rootPath });
  return Result.succeed(toProjectDto(row));
};

export type ProjectPatch = Partial<
  Pick<ProjectRow, 'name' | 'defaultBaseBranch' | 'githubRemote' | 'collapsedGlobs' | 'testGlobs'>
>;

export const updateProject = async (
  ctx: AppContext,
  id: string,
  patch: ProjectPatch,
): Result.ResultAsync<ProjectDto, AppError> => {
  if (patch.githubRemote && !parseRepoRef(patch.githubRemote))
    return Result.fail({
      type: 'validation.invalid',
      message: 'GitHub リモートは owner/repo の形式で指定してください',
    });
  const row = await ctx.repos.projects.update(id, patch);
  return row ? Result.succeed(toProjectDto(row)) : Result.fail({ type: 'notFound', resource: 'project', id });
};

export const touchProject = async (ctx: AppContext, id: string): Promise<void> => {
  await ctx.repos.projects.update(id, { lastOpenedAt: Date.now() });
};

/** PAT を疎通確認してから暗号化して保存する */
export const savePat = async (
  ctx: AppContext,
  id: string,
  token: string,
): Result.ResultAsync<ProjectDto, AppError> => {
  const project = await getProject(ctx, id);
  if (Result.isFailure(project)) return project;
  const repoRef = project.value.githubRemote ? parseRepoRef(project.value.githubRemote) : null;
  if (!repoRef) return Result.fail({ type: 'github.remoteNotConfigured' });
  const check = await new GitHubClient(token.trim(), repoRef, githubApiOptions()).getRepo();
  if (Result.isFailure(check)) return check;
  const encrypted = encryptSecret(token.trim());
  if (Result.isFailure(encrypted)) return encrypted;
  const row = await ctx.repos.projects.update(id, { encryptedPat: encrypted.value });
  ctx.logger.info('PAT saved', { projectId: id, repo: check.value.fullName });
  return row ? Result.succeed(toProjectDto(row)) : Result.fail({ type: 'notFound', resource: 'project', id });
};

export const deletePat = async (ctx: AppContext, id: string): Result.ResultAsync<ProjectDto, AppError> => {
  const row = await ctx.repos.projects.update(id, { encryptedPat: null });
  return row ? Result.succeed(toProjectDto(row)) : Result.fail({ type: 'notFound', resource: 'project', id });
};

export type GitHubAccess = { client: GitHubClient; token: string };

export const githubAccessOf = (project: ProjectRow): Result.Result<GitHubAccess, GitHubError> => {
  const repoRef = project.githubRemote ? parseRepoRef(project.githubRemote) : null;
  if (!repoRef) return Result.fail({ type: 'github.remoteNotConfigured' });
  const token = decryptSecret(project.encryptedPat);
  if (Result.isFailure(token)) return token;
  return Result.succeed({
    client: new GitHubClient(token.value, repoRef, githubApiOptions()),
    token: token.value,
  });
};

export const listBranches = async (
  ctx: AppContext,
  id: string,
): Result.ResultAsync<{ branches: string[]; current: string | null }, AppError> => {
  const project = await getProject(ctx, id);
  if (Result.isFailure(project)) return project;
  const git = gitClientOf(ctx);
  if (!git) return Result.fail(gitMissing());
  const branches = await git.listBranches(project.value.rootPath);
  if (Result.isFailure(branches)) return branches;
  const current = await git.currentBranch(project.value.rootPath);
  return Result.succeed({
    branches: branches.value,
    current: Result.isSuccess(current) ? current.value : null,
  });
};
