import { LspSession, type FileChange, type LspStatus } from '@tsugi/core';

import type { EventBus } from '../event-bus';
import type { Logger } from '../logger';

const IDLE_MS = 10 * 60_000;
const MAX_RESTARTS = 3;

type Entry = { session: LspSession; restarts: number; status: LspStatus; message?: string };

/** Workspace ごとの tsc --lsp を管理する（docs/specs/04） */
export class LspManager {
  readonly #sessions = new Map<string, Entry>();
  readonly #tscPath: () => Promise<string>;
  readonly #bus: EventBus;
  readonly #logger: Logger;
  readonly #idleTimer: NodeJS.Timeout;

  constructor(tscPath: () => Promise<string>, bus: EventBus, logger: Logger) {
    this.#tscPath = tscPath;
    this.#bus = bus;
    this.#logger = logger;
    this.#idleTimer = setInterval(() => void this.#stopIdle(), 60_000);
  }

  status(workspace: string): { status: LspStatus; message?: string } {
    const entry = this.#sessions.get(workspace);
    if (!entry) return { status: 'stopped' };
    return entry.message ? { status: entry.status, message: entry.message } : { status: entry.status };
  }

  /** Workspace の LSP を取得する（未起動なら起動する） */
  async get(workspace: string): Promise<LspSession> {
    const existing = this.#sessions.get(workspace);
    if (existing && existing.status !== 'error' && existing.status !== 'stopped') {
      existing.session.lastUsedAt = Date.now();
      return existing.session;
    }
    return this.#start(workspace, existing?.restarts ?? 0);
  }

  async #start(workspace: string, restarts: number): Promise<LspSession> {
    const tscPath = await this.#tscPath();
    const entry: Entry = { session: undefined as unknown as LspSession, restarts, status: 'starting' };
    const session = new LspSession({
      tscPath,
      workspacePath: workspace,
      onStatus: (status, message) => {
        entry.status = status;
        if (message) entry.message = message;
        else delete entry.message;
        this.#bus.emit({ type: 'lsp.status', workspace, status, ...(message ? { message } : {}) });
      },
      onLog: (message) => this.#logger.debug(`[lsp ${workspace}] ${message.trim()}`),
      onExit: (code) => {
        if (entry.status === 'stopped') return;
        this.#logger.warn('tsc --lsp exited', { workspace, code });
        if (entry.restarts < MAX_RESTARTS) {
          entry.restarts += 1;
          void this.#start(workspace, entry.restarts);
        }
      },
    });
    entry.session = session;
    this.#sessions.set(workspace, entry);
    session.start();
    return session;
  }

  async notifyFileChanges(workspace: string, changes: FileChange[]): Promise<void> {
    await this.#sessions.get(workspace)?.session.notifyFileChanges(changes);
  }

  async stop(workspace: string): Promise<void> {
    const entry = this.#sessions.get(workspace);
    if (!entry) return;
    this.#sessions.delete(workspace);
    entry.status = 'stopped';
    await entry.session.stop();
  }

  async #stopIdle(): Promise<void> {
    const now = Date.now();
    for (const [workspace, entry] of this.#sessions) {
      if (now - entry.session.lastUsedAt > IDLE_MS) {
        this.#logger.info('stopping idle LSP', { workspace });
        await this.stop(workspace);
      }
    }
  }

  async dispose(): Promise<void> {
    clearInterval(this.#idleTimer);
    await Promise.all([...this.#sessions.keys()].map((w) => this.stop(w)));
  }
}
