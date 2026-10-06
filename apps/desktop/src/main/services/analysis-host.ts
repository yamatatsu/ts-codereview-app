import { utilityProcess, type UtilityProcess } from 'electron';

import type {
  AnalysisEvent,
  AnalysisMessage,
  AnalysisRequest,
  AnalysisResponseMap,
} from '../../shared/analysis-protocol';
import type { Logger } from '../logger';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

/** analysis の utility process を起動し、型付きのリクエスト／イベントを仲介する（docs/adr/0007） */
export class AnalysisHost {
  readonly #entry: string;
  readonly #logger: Logger;
  readonly #listeners = new Set<(event: AnalysisEvent) => void>();
  readonly #pending = new Map<number, Pending>();
  #child: UtilityProcess | undefined;
  #nextId = 1;
  #gitPath: string | undefined;

  constructor(entry: string, logger: Logger) {
    this.#entry = entry;
    this.#logger = logger;
  }

  start(gitPath: string): void {
    this.#gitPath = gitPath;
    if (this.#child) {
      this.#child.postMessage({ kind: 'init', gitPath } satisfies AnalysisMessage);
      return;
    }
    const child = utilityProcess.fork(this.#entry, [], { serviceName: 'TSugi Analysis', stdio: 'pipe' });
    child.stdout?.on('data', (d: Buffer) => this.#logger.debug(`[analysis] ${d.toString().trim()}`));
    child.stderr?.on('data', (d: Buffer) => this.#logger.warn(`[analysis] ${d.toString().trim()}`));
    child.on('message', (message: AnalysisMessage) => this.#onMessage(message));
    child.on('exit', (code) => {
      this.#logger.warn('analysis process exited', { code });
      this.#child = undefined;
      for (const pending of this.#pending.values()) pending.reject(new Error('analysis process exited'));
      this.#pending.clear();
      // 異常終了したら再起動する
      if (code !== 0 && this.#gitPath) setTimeout(() => this.#gitPath && this.start(this.#gitPath), 1000);
    });
    child.postMessage({ kind: 'init', gitPath } satisfies AnalysisMessage);
    this.#child = child;
  }

  #onMessage(message: AnalysisMessage): void {
    if (message.kind === 'event') {
      if (message.event.type === 'log')
        this.#logger.log(message.event.level, `[analysis] ${message.event.message}`);
      for (const listener of this.#listeners) listener(message.event);
      return;
    }
    if (message.kind !== 'response') return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error));
  }

  onEvent(listener: (event: AnalysisEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  request<M extends AnalysisRequest['method']>(
    method: M,
    params: Extract<AnalysisRequest, { method: M }>['params'],
  ): Promise<AnalysisResponseMap[M]> {
    const child = this.#child;
    if (!child) return Promise.reject(new Error('analysis process is not running'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      child.postMessage({
        kind: 'request',
        id,
        request: { method, params } as AnalysisRequest,
      } satisfies AnalysisMessage);
    });
  }

  stop(): void {
    this.#child?.kill();
    this.#child = undefined;
  }
}
