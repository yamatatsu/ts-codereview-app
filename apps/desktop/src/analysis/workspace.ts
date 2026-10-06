import path from 'node:path';

import watcher from '@parcel/watcher';
import { Result } from '@praha/byethrow';
import {
  buildBaseOutgoing,
  computeReviewOrder,
  computeTestLinks,
  diffEdges,
  GitClient,
  ImportGraph,
  testsByImpl,
  type ChangedFile,
  type GraphEdge,
  type TestLink,
} from '@tsugi/core';

import type { AnalysisEvent } from '../shared/analysis-protocol';

const WATCH_IGNORE = [
  '**/node_modules/**',
  '.git/objects/**',
  '.git/logs/**',
  '**/.DS_Store',
  '**/dist/**',
  '**/out/**',
  '**/coverage/**',
];

/** 1 つの Workspace（clone 本体または PR の worktree）の解析状態 */
export class AnalysisWorkspace {
  readonly root: string;
  readonly graph: ImportGraph;
  readonly #git: GitClient;
  readonly #emit: (event: AnalysisEvent) => void;
  #testGlobs: string[];
  #ready = false;
  #building: Promise<void> | undefined;
  #subscription: watcher.AsyncSubscription | undefined;
  #testLinks: TestLink[] | undefined;
  #allFiles: string[] = [];
  #pendingChanged = new Set<string>();
  #pendingRemoved = new Set<string>();
  #gitChanged = false;
  #flushTimer: NodeJS.Timeout | undefined;

  constructor(root: string, git: GitClient, testGlobs: string[], emit: (event: AnalysisEvent) => void) {
    this.root = root;
    this.graph = new ImportGraph(root);
    this.#git = git;
    this.#testGlobs = testGlobs;
    this.#emit = emit;
  }

  get ready(): boolean {
    return this.#ready;
  }

  get files(): string[] {
    return this.#allFiles;
  }

  setTestGlobs(globs: string[]): void {
    if (JSON.stringify(globs) !== JSON.stringify(this.#testGlobs)) {
      this.#testGlobs = globs;
      this.#testLinks = undefined;
    }
  }

  open(watch: boolean): Promise<void> {
    this.#building ??= this.#build(watch);
    return this.#building;
  }

  async #build(watch: boolean): Promise<void> {
    const files = await this.#git.lsFiles(this.root);
    if (Result.isFailure(files)) {
      this.#emit({ type: 'log', level: 'error', message: `ls-files failed: ${JSON.stringify(files.error)}` });
      this.#allFiles = [];
    } else {
      this.#allFiles = files.value;
    }
    const started = Date.now();
    await this.graph.build(this.#allFiles, (done, total) =>
      this.#emit({ type: 'progress', workspace: this.root, phase: 'graph', done, total }),
    );
    this.#ready = true;
    this.#emit({
      type: 'log',
      level: 'info',
      message: `graph built: ${this.graph.size} files in ${Date.now() - started}ms (${this.root})`,
    });
    this.#emit({ type: 'ready', workspace: this.root });
    if (watch) await this.#watch();
  }

  async #watch(): Promise<void> {
    this.#subscription = await watcher.subscribe(
      this.root,
      (error, events) => {
        if (error) {
          this.#emit({ type: 'log', level: 'warn', message: `watcher: ${error.message}` });
          return;
        }
        for (const event of events) {
          const relative = path.relative(this.root, event.path).split(path.sep).join('/');
          if (relative.startsWith('.git/') || relative === '.git') {
            this.#gitChanged = true;
            continue;
          }
          if (event.type === 'delete') {
            this.#pendingRemoved.add(relative);
            this.#pendingChanged.delete(relative);
          } else {
            this.#pendingChanged.add(relative);
            this.#pendingRemoved.delete(relative);
          }
        }
        this.#scheduleFlush();
      },
      { ignore: WATCH_IGNORE },
    );
  }

  #scheduleFlush(): void {
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#flushTimer = setTimeout(() => void this.#flush(), 300);
  }

  async #flush(): Promise<void> {
    const changed = [...this.#pendingChanged];
    const removed = [...this.#pendingRemoved];
    const gitChanged = this.#gitChanged;
    this.#pendingChanged.clear();
    this.#pendingRemoved.clear();
    this.#gitChanged = false;
    if (changed.length === 0 && removed.length === 0 && !gitChanged) return;

    const fileSet = new Set(this.#allFiles);
    for (const f of removed) fileSet.delete(f);
    for (const f of changed) fileSet.add(f);
    this.#allFiles = [...fileSet];
    await this.graph.update(changed, removed);
    this.#testLinks = undefined;
    this.#emit({ type: 'fs.changed', workspace: this.root, changed, removed, gitChanged });
  }

  testLinks(): TestLink[] {
    this.#testLinks ??= computeTestLinks(
      this.#allFiles,
      this.#allFiles.flatMap((f) => this.graph.outgoing(f)),
      this.#testGlobs,
    );
    return this.#testLinks;
  }

  reviewOrder(files: readonly ChangedFile[]) {
    const impl = files.filter((f) => f.kind === 'impl' && f.status !== 'D').map((f) => f.path);
    const implSet = new Set(impl);
    const edges = impl.flatMap((f) => this.graph.outgoing(f)).filter((e) => implSet.has(e.to));
    const changedTests = new Set(files.filter((f) => f.kind === 'test').map((f) => f.path));
    const primary = testsByImpl(this.testLinks(), 'primary');
    const tests = new Map(
      [...primary].map(([impl, list]) => [impl, list.filter((t) => changedTests.has(t))]),
    );
    const others = files.filter((f) => !implSet.has(f.path)).map((f) => f.path);
    return computeReviewOrder(impl, edges, tests, others);
  }

  async graphDiff(repoPath: string, baseRev: string, files: readonly ChangedFile[]) {
    const changed = new Set(files.map((f) => f.path));
    const headEdges: GraphEdge[] = files
      .filter((f) => f.status !== 'D')
      .flatMap((f) => this.graph.outgoing(f.path));
    const base = await buildBaseOutgoing(this.#git, repoPath, baseRev, files, this.graph);
    const baseEdges = Result.isSuccess(base) ? base.value : [];
    // 変更されていないファイルからの incoming も表示用に含める（unchanged 扱い）
    const incoming = files
      .flatMap((f) => this.graph.incomingEdges(f.path))
      .filter((e) => !changed.has(e.from));
    return [
      ...diffEdges(baseEdges, headEdges),
      ...incoming.map((e) => ({ ...e, change: 'unchanged' as const })),
    ];
  }

  async close(): Promise<void> {
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    await this.#subscription?.unsubscribe();
    this.#subscription = undefined;
  }
}
