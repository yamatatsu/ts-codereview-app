import path from 'node:path';

import { Result } from '@praha/byethrow';
import {
  collectChangedFiles,
  computeViewedStates,
  FILE_CHANGE_TYPE,
  installDependencies,
  isTsFile,
  parseTargetKey,
  preparePrWorktree,
  resolveLocalTarget,
  symlinkNodeModules,
  targetKey,
  targetLocalKey,
  viewedProgress,
  WORKTREE,
  type AppError,
  type ProjectRow,
  type ReviewTarget,
} from '@tsugi/core';

import type { AnalysisEvent } from '../../shared/analysis-protocol';
import type { BlobsDto, InstallStatus, TargetDto } from '../../shared/dto';
import { gitClientOf, type AppContext } from './context';
import { isBinary, readFileWithin } from './files';
import { getProject, githubAccessOf, touchProject } from './projects';

const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'];

/** ReviewTarget の解決とキャッシュ、ファイル内容の提供を担う */
export class TargetService {
  readonly #ctx: AppContext;
  readonly #cache = new Map<string, TargetDto>();
  readonly #resolving = new Map<string, Result.ResultAsync<TargetDto, AppError>>();

  constructor(ctx: AppContext) {
    this.#ctx = ctx;
    ctx.analysis.onEvent((event) => void this.#onAnalysisEvent(event));
  }

  async #onAnalysisEvent(event: AnalysisEvent): Promise<void> {
    if (event.type === 'ready') this.#ctx.bus.emit({ type: 'analysis.ready', workspace: event.workspace });
    if (event.type === 'progress') {
      const { workspace, phase, done, total } = event;
      this.#ctx.bus.emit({ type: 'analysis.progress', workspace, phase, done, total });
    }
    if (event.type !== 'fs.changed') return;
    const changes = [
      ...event.changed.map((f) => ({
        absPath: path.join(event.workspace, f),
        type: FILE_CHANGE_TYPE.changed,
      })),
      ...event.removed.map((f) => ({
        absPath: path.join(event.workspace, f),
        type: FILE_CHANGE_TYPE.deleted,
      })),
    ].filter((c) => isTsFile(c.absPath) || c.absPath.endsWith('.json'));
    await this.#ctx.lsp.notifyFileChanges(event.workspace, changes);
    for (const [key, dto] of this.#cache) {
      if (dto.workspacePath !== event.workspace || dto.target.kind === 'pr') continue;
      const refreshed = await this.#resolveFresh(dto.target);
      if (Result.isSuccess(refreshed)) this.#ctx.bus.emit({ type: 'workspace.changed', targetKey: key });
    }
  }

  cached(key: string): TargetDto | undefined {
    return this.#cache.get(key);
  }

  async get(key: string): Result.ResultAsync<TargetDto, AppError> {
    const cached = this.#cache.get(key);
    if (cached) return Result.succeed(cached);
    const target = parseTargetKey(key);
    if (!target) return Result.fail({ type: 'validation.invalid', message: `不正な ReviewTarget: ${key}` });
    return this.resolve(target);
  }

  /** 同じキーの解決が並行したら 1 つにまとめる */
  resolve(target: ReviewTarget): Result.ResultAsync<TargetDto, AppError> {
    const key = targetKey(target);
    const inflight = this.#resolving.get(key);
    if (inflight) return inflight;
    const promise = this.#resolveFresh(target).finally(() => this.#resolving.delete(key));
    this.#resolving.set(key, promise);
    return promise;
  }

  async #resolveFresh(target: ReviewTarget): Result.ResultAsync<TargetDto, AppError> {
    const project = await getProject(this.#ctx, target.projectId);
    if (Result.isFailure(project)) return project;
    const git = gitClientOf(this.#ctx);
    if (!git) return Result.fail({ type: 'spawn.executableNotAllowed', executable: 'git' });

    let dto: TargetDto;
    if (target.kind === 'pr') {
      const resolved = await this.#resolvePr(project.value, target);
      if (Result.isFailure(resolved)) return resolved;
      dto = resolved.value;
    } else {
      const resolved = await resolveLocalTarget(git, project.value, target);
      if (Result.isFailure(resolved)) return resolved;
      dto = { ...resolved.value };
    }
    this.#cache.set(dto.key, dto);
    await touchProject(this.#ctx, project.value.id);
    await this.#ctx.analysis
      .request('workspace.open', {
        workspace: dto.workspacePath,
        watch: target.kind !== 'pr',
        testGlobs: project.value.testGlobs,
      })
      .catch((error: unknown) => this.#ctx.logger.warn('analysis open failed', { error: String(error) }));
    // 初回のジャンプを速くするため、LSP を先に起動しておく（依存のインストール中は待つ）
    if (dto.install !== 'pending' && dto.install !== 'running') void this.#ctx.lsp.get(dto.workspacePath);
    return Result.succeed(dto);
  }

  async #resolvePr(
    project: ProjectRow,
    target: Extract<ReviewTarget, { kind: 'pr' }>,
  ): Result.ResultAsync<TargetDto, AppError> {
    const git = gitClientOf(this.#ctx);
    if (!git) return Result.fail({ type: 'spawn.executableNotAllowed', executable: 'git' });
    const access = githubAccessOf(project);
    if (Result.isFailure(access)) return access;
    const pull = await access.value.client.getPull(target.number);
    if (Result.isFailure(pull)) return pull;
    const key = targetKey(target);
    const existing = await this.#ctx.repos.prWorktrees.get(project.id, target.number);
    const worktreeDir =
      existing?.path ?? path.join(this.#ctx.paths.worktrees, project.id, `pr-${target.number}`);

    const prepared = await preparePrWorktree({
      git,
      repoPath: project.rootPath,
      remote: 'origin',
      prNumber: target.number,
      baseBranch: pull.value.baseRef,
      worktreeDir,
      token: access.value.token,
      onLog: (line) => this.#ctx.bus.emit({ type: 'worktree.install.log', targetKey: key, line }),
    });
    if (Result.isFailure(prepared)) return prepared;

    const files = await collectChangedFiles(
      git,
      {
        repoPath: project.rootPath,
        workspacePath: prepared.value.worktreeDir,
        baseRev: prepared.value.baseRev,
        headRev: prepared.value.headRev,
      },
      project,
    );
    if (Result.isFailure(files)) return files;

    // lockfile が変わったとき・初回・前回失敗時だけ install する
    const lockfileChanged = existing
      ? existing.headSha !== prepared.value.headRev &&
        (await this.#lockfileChanged(project.rootPath, existing.headSha, prepared.value.headRev))
      : true;
    const needsInstall =
      prepared.value.created || !existing || existing.installStatus === 'failed' || lockfileChanged;
    const installStatus: InstallStatus = needsInstall ? 'pending' : (existing?.installStatus ?? 'pending');
    const row = await this.#ctx.repos.prWorktrees.upsert({
      projectId: project.id,
      prNumber: target.number,
      path: prepared.value.worktreeDir,
      headSha: prepared.value.headRev,
      baseRef: pull.value.baseRef,
      installStatus,
      lastOpenedAt: Date.now(),
    });

    const checks = await access.value.client.getChecksSummary(pull.value.headSha);
    const dto: TargetDto = {
      key,
      target,
      baseRev: prepared.value.baseRev,
      headRev: prepared.value.headRev,
      workspacePath: prepared.value.worktreeDir,
      files: files.value,
      warnings: [],
      pr: { ...pull.value, checks: Result.isSuccess(checks) ? checks.value : null },
      install: installStatus,
    };
    if (needsInstall) void this.#install(key, project, row.id, prepared.value.worktreeDir);
    else if (installStatus === 'fallback')
      dto.warnings.push(
        '依存は clone 本体の node_modules を参照しています。PR の依存と異なる可能性があります。',
      );
    return Result.succeed(dto);
  }

  async #lockfileChanged(repoPath: string, from: string, to: string): Promise<boolean> {
    const git = gitClientOf(this.#ctx);
    if (!git) return true;
    const diff = await git.diffNameStatus(repoPath, from, to);
    return Result.isFailure(diff) || diff.value.some((e) => LOCKFILES.includes(path.posix.basename(e.path)));
  }

  async #install(key: string, project: ProjectRow, worktreeId: string, dir: string): Promise<void> {
    const { bus, repos, settings, logger } = this.#ctx;
    const setStatus = async (status: InstallStatus) => {
      await repos.prWorktrees.update(worktreeId, { installStatus: status });
      const dto = this.#cache.get(key);
      if (dto) {
        dto.install = status;
        if (status === 'fallback')
          dto.warnings = [
            '依存のインストールに失敗したため、clone 本体の node_modules を参照しています。PR の依存と異なる可能性があります。',
          ];
      }
    };
    await setStatus('running');
    const result = await installDependencies(dir, settings.get().executables, (line) =>
      bus.emit({ type: 'worktree.install.log', targetKey: key, line }),
    );
    let status: InstallStatus;
    if (Result.isSuccess(result)) status = 'ok';
    else {
      logger.warn('install failed, falling back to symlink', { key, error: result.error });
      status = (await symlinkNodeModules(project.rootPath, dir)) ? 'fallback' : 'failed';
    }
    await setStatus(status);
    // 依存が揃ったので LSP を起動し直す
    await this.#ctx.lsp.stop(dir);
    void this.#ctx.lsp.get(dir);
    bus.emit({
      type: 'worktree.install.done',
      targetKey: key,
      result: status === 'ok' ? 'ok' : status === 'fallback' ? 'fallback' : 'failed',
    });
    bus.emit({ type: 'workspace.changed', targetKey: key });
  }

  invalidate(key: string): void {
    this.#cache.delete(key);
  }

  async blobs(key: string, file: string): Result.ResultAsync<BlobsDto, AppError> {
    const target = await this.get(key);
    if (Result.isFailure(target)) return target;
    const git = gitClientOf(this.#ctx);
    if (!git) return Result.fail({ type: 'spawn.executableNotAllowed', executable: 'git' });
    const dto = target.value;
    const changed = dto.files.find((f) => f.path === file);
    const status = changed?.status ?? 'M';
    const basePath = changed?.oldPath ?? file;

    let base: Buffer | null = null;
    if (status !== 'A') {
      const result = await git.showFile(dto.workspacePath, dto.baseRev, basePath);
      if (Result.isSuccess(result)) base = result.value;
    }
    let head: Buffer | null = null;
    if (status !== 'D') {
      if (dto.headRev === WORKTREE || dto.target.kind === 'pr') {
        const result = await readFileWithin([dto.workspacePath], file);
        if (Result.isSuccess(result)) head = result.value.buffer;
      } else {
        const result = await git.showFile(dto.workspacePath, dto.headRev, file);
        if (Result.isSuccess(result)) head = result.value;
      }
    }
    const binary = (base !== null && isBinary(base)) || (head !== null && isBinary(head));
    return Result.succeed({
      path: file,
      base: base && !binary ? { name: basePath, contents: base.toString('utf8') } : null,
      head: head && !binary ? { name: file, contents: head.toString('utf8') } : null,
      binary,
    });
  }

  /** 任意の blob を取得する（差分の差分用） */
  async blobBySha(key: string, sha: string): Result.ResultAsync<string, AppError> {
    const target = await this.get(key);
    if (Result.isFailure(target)) return target;
    const git = gitClientOf(this.#ctx);
    if (!git) return Result.fail({ type: 'spawn.executableNotAllowed', executable: 'git' });
    const blob = await git.catBlob(target.value.workspacePath, sha);
    if (Result.isSuccess(blob)) return Result.succeed(blob.value.toString('utf8'));
    const snapshot = await this.#ctx.repos.blobSnapshots.get(sha);
    return snapshot ? Result.succeed(snapshot.toString('utf8')) : blob;
  }

  /** 作業ツリーの内容は git に無いので、Viewed / メモの時点の内容を DB に残す */
  async snapshot(key: string, file: string): Promise<void> {
    const target = await this.get(key);
    if (Result.isFailure(target) || target.value.headRev !== WORKTREE) return;
    const changed = target.value.files.find((f) => f.path === file);
    if (!changed?.headBlob) return;
    const read = await readFileWithin([target.value.workspacePath], file);
    if (Result.isSuccess(read)) await this.#ctx.repos.blobSnapshots.put(changed.headBlob, read.value.buffer);
  }

  async viewed(key: string) {
    const target = await this.get(key);
    if (Result.isFailure(target)) return target;
    const records = await this.#ctx.repos.viewed.list(
      target.value.target.projectId,
      targetLocalKey(target.value.target),
    );
    const states = computeViewedStates(target.value.files, records);
    return Result.succeed({ states, progress: viewedProgress(target.value.files, states) });
  }
}
