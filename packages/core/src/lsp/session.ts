import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node';

import { errorMessage, type LspError, type SpawnError } from '../errors';
import { spawnLongRunning } from '../process/spawn';
import { normalizeHover, normalizeLocations, normalizeSymbols, pathToUri } from './convert';
import type { CodeLocation, DocumentSymbolInfo, HoverInfo, LspStatus, Position } from './types';

export type LspSessionOptions = {
  /** TS7 のネイティブ tsc の絶対パス */
  tscPath: string;
  workspacePath: string;
  requestTimeoutMs?: number;
  maxOpenDocuments?: number;
  onStatus?: (status: LspStatus, message?: string) => void;
  onExit?: (code: number | null) => void;
  onLog?: (message: string) => void;
};

const LANGUAGE_IDS: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

export const FILE_CHANGE_TYPE = { created: 1, changed: 2, deleted: 3 } as const;
export type FileChange = { absPath: string; type: (typeof FILE_CHANGE_TYPE)[keyof typeof FILE_CHANGE_TYPE] };

/**
 * 1 つの Workspace に対する `tsc --lsp --stdio` のセッション（docs/adr/0010）。
 * 読み取り専用なので didChange は送らず、ファイルの変更は didChangeWatchedFiles で伝える。
 */
export class LspSession {
  readonly workspacePath: string;
  #connection: MessageConnection | undefined;
  #kill: (() => void) | undefined;
  #status: LspStatus = 'stopped';
  #ready: Promise<void> | undefined;
  /** 開いているドキュメント（挿入順 = LRU） */
  readonly #open = new Map<string, number>();
  readonly #options: Required<Pick<LspSessionOptions, 'requestTimeoutMs' | 'maxOpenDocuments'>> &
    LspSessionOptions;
  lastUsedAt = Date.now();

  constructor(options: LspSessionOptions) {
    this.workspacePath = options.workspacePath;
    this.#options = { requestTimeoutMs: 30_000, maxOpenDocuments: 50, ...options };
  }

  get status(): LspStatus {
    return this.#status;
  }

  #setStatus(status: LspStatus, message?: string) {
    this.#status = status;
    this.#options.onStatus?.(status, message);
  }

  start(): Result.Result<void, SpawnError> {
    const spawned = spawnLongRunning(this.#options.tscPath, ['--lsp', '--stdio'], {
      cwd: this.workspacePath,
    });
    if (Result.isFailure(spawned)) {
      this.#setStatus('error', JSON.stringify(spawned.error));
      return spawned;
    }
    const { child } = spawned.value;
    this.#setStatus('starting');
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    this.#connection = connection;
    this.#kill = () => child.kill();

    child.stderr.on('data', (chunk: Buffer) => this.#options.onLog?.(chunk.toString('utf8')));
    child.on('exit', (code) => {
      this.#connection?.dispose();
      this.#connection = undefined;
      this.#open.clear();
      if (this.#status !== 'stopped') this.#setStatus('error', `tsc --lsp が終了しました (code ${code})`);
      this.#options.onExit?.(code);
    });

    // サーバーからのリクエストには最小限の応答を返す
    connection.onRequest('workspace/configuration', (params: { items?: unknown[] }) =>
      (params.items ?? []).map(() => null),
    );
    connection.onRequest('client/registerCapability', () => null);
    connection.onRequest('client/unregisterCapability', () => null);
    connection.onRequest('window/workDoneProgress/create', () => null);
    connection.onRequest('window/showMessageRequest', () => null);
    connection.onNotification('window/logMessage', (params: { message?: string }) => {
      if (params.message) this.#options.onLog?.(params.message);
    });
    connection.listen();

    this.#ready = (async () => {
      await connection.sendRequest('initialize', {
        processId: process.pid,
        clientInfo: { name: 'TSugi' },
        rootUri: pathToUri(this.workspacePath),
        workspaceFolders: [{ uri: pathToUri(this.workspacePath), name: path.basename(this.workspacePath) }],
        capabilities: {
          general: { positionEncodings: ['utf-16'] },
          textDocument: {
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            typeDefinition: { linkSupport: true },
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          },
          workspace: { workspaceFolders: true, didChangeWatchedFiles: { dynamicRegistration: false } },
        },
      });
      await connection.sendNotification('initialized', {});
      this.#setStatus('ready');
    })().catch((error: unknown) => {
      this.#setStatus('error', errorMessage(error));
      throw error;
    });
    return Result.succeed();
  }

  async #whenReady(method: string): Result.ResultAsync<MessageConnection, LspError> {
    if (!this.#ready || !this.#connection)
      return Result.fail({ type: 'lsp.notRunning', workspace: this.workspacePath });
    const ready = await Result.try({
      try: () => withTimeout(this.#ready as Promise<void>, this.#options.requestTimeoutMs),
      catch: (error): LspError =>
        error instanceof TimeoutError
          ? { type: 'lsp.timeout', method }
          : { type: 'lsp.requestFailed', method, message: errorMessage(error) },
    });
    if (Result.isFailure(ready)) return ready;
    const connection = this.#connection;
    return connection
      ? Result.succeed(connection)
      : Result.fail({ type: 'lsp.notRunning', workspace: this.workspacePath });
  }

  async #request<T>(method: string, params: unknown): Result.ResultAsync<T, LspError> {
    this.lastUsedAt = Date.now();
    const connection = await this.#whenReady(method);
    if (Result.isFailure(connection)) return connection;
    return Result.try({
      try: () =>
        withTimeout(
          connection.value.sendRequest(method, params) as Promise<T>,
          this.#options.requestTimeoutMs,
        ),
      catch: (error): LspError =>
        error instanceof TimeoutError
          ? { type: 'lsp.timeout', method }
          : { type: 'lsp.requestFailed', method, message: errorMessage(error) },
    });
  }

  /** ファイルを開く（LRU で最大 maxOpenDocuments 件） */
  async openDocument(absPath: string): Result.ResultAsync<void, LspError> {
    const connection = await this.#whenReady('textDocument/didOpen');
    if (Result.isFailure(connection)) return connection;
    const uri = pathToUri(absPath);
    if (this.#open.has(uri)) {
      const version = this.#open.get(uri) ?? 1;
      this.#open.delete(uri);
      this.#open.set(uri, version);
      return Result.succeed();
    }
    const text = await Result.try({
      try: () => readFile(absPath, 'utf8'),
      catch: (error): LspError => ({
        type: 'lsp.requestFailed',
        method: 'didOpen',
        message: errorMessage(error),
      }),
    });
    if (Result.isFailure(text)) return text;
    await connection.value.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: LANGUAGE_IDS[path.extname(absPath)] ?? 'typescript',
        version: 1,
        text: text.value,
      },
    });
    this.#open.set(uri, 1);
    while (this.#open.size > this.#options.maxOpenDocuments) {
      const oldest = this.#open.keys().next().value;
      if (oldest === undefined) break;
      this.#open.delete(oldest);
      await connection.value.sendNotification('textDocument/didClose', { textDocument: { uri: oldest } });
    }
    return Result.succeed();
  }

  async #positional<T>(method: string, absPath: string, position: Position, extra: object = {}) {
    const opened = await this.openDocument(absPath);
    if (Result.isFailure(opened)) return opened;
    return this.#request<T>(method, { textDocument: { uri: pathToUri(absPath) }, position, ...extra });
  }

  async definition(absPath: string, position: Position): Result.ResultAsync<CodeLocation[], LspError> {
    const raw = await this.#positional<unknown>('textDocument/definition', absPath, position);
    return Result.isFailure(raw) ? raw : Result.succeed(normalizeLocations(raw.value));
  }

  async typeDefinition(absPath: string, position: Position): Result.ResultAsync<CodeLocation[], LspError> {
    const raw = await this.#positional<unknown>('textDocument/typeDefinition', absPath, position);
    return Result.isFailure(raw) ? raw : Result.succeed(normalizeLocations(raw.value));
  }

  async references(absPath: string, position: Position): Result.ResultAsync<CodeLocation[], LspError> {
    const raw = await this.#positional<unknown>('textDocument/references', absPath, position, {
      context: { includeDeclaration: true },
    });
    return Result.isFailure(raw) ? raw : Result.succeed(normalizeLocations(raw.value));
  }

  async hover(absPath: string, position: Position): Result.ResultAsync<HoverInfo | null, LspError> {
    const raw = await this.#positional<unknown>('textDocument/hover', absPath, position);
    return Result.isFailure(raw) ? raw : Result.succeed(normalizeHover(raw.value));
  }

  async documentSymbols(absPath: string): Result.ResultAsync<DocumentSymbolInfo[], LspError> {
    const opened = await this.openDocument(absPath);
    if (Result.isFailure(opened)) return opened;
    const raw = await this.#request<unknown>('textDocument/documentSymbol', {
      textDocument: { uri: pathToUri(absPath) },
    });
    return Result.isFailure(raw) ? raw : Result.succeed(normalizeSymbols(raw.value));
  }

  /** ファイル監視の通知を LSP に伝える。開いているドキュメントは閉じて開き直す */
  async notifyFileChanges(changes: readonly FileChange[]): Promise<void> {
    const connection = this.#connection;
    if (!connection || this.#status !== 'ready' || changes.length === 0) return;
    await connection.sendNotification('workspace/didChangeWatchedFiles', {
      changes: changes.map((c) => ({ uri: pathToUri(c.absPath), type: c.type })),
    });
    for (const change of changes) {
      const uri = pathToUri(change.absPath);
      if (this.#open.has(uri)) {
        this.#open.delete(uri);
        await connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
      }
    }
  }

  async stop(): Promise<void> {
    const connection = this.#connection;
    this.#setStatus('stopped');
    if (connection) {
      try {
        await withTimeout(connection.sendRequest('shutdown'), 2_000);
        await connection.sendNotification('exit');
      } catch {
        // 応答がなければ kill する
      }
      connection.dispose();
    }
    this.#kill?.();
    this.#connection = undefined;
    this.#open.clear();
  }
}

class TimeoutError extends Error {}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
