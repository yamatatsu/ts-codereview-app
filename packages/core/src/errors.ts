/**
 * TSugi 全体のエラー型。`type` フィールドで判別する（docs/adr/0009）。
 */

export type SpawnError =
  | { type: 'spawn.executableNotAllowed'; executable: string }
  | { type: 'spawn.failedToStart'; executable: string; message: string }
  | { type: 'spawn.timeout'; executable: string; args: readonly string[] };

export type GitError =
  | { type: 'git.notARepository'; path: string }
  | { type: 'git.revisionNotFound'; rev: string }
  | { type: 'git.commandFailed'; args: readonly string[]; exitCode: number; stderr: string }
  | SpawnError;

export type GitHubError =
  | { type: 'github.tokenMissing' }
  | { type: 'github.encryptionUnavailable' }
  | { type: 'github.unauthorized'; message: string }
  | { type: 'github.forbidden'; message: string }
  | { type: 'github.notFound'; resource: string }
  | { type: 'github.remoteNotConfigured' }
  | { type: 'github.requestFailed'; status: number; message: string };

export type FsError =
  | { type: 'fs.notFound'; path: string }
  | { type: 'fs.outsideWorkspace'; path: string }
  | { type: 'fs.readFailed'; path: string; message: string };

export type LspError =
  | { type: 'lsp.notRunning'; workspace: string }
  | { type: 'lsp.timeout'; method: string }
  | { type: 'lsp.requestFailed'; method: string; message: string };

export type AnalysisError =
  | { type: 'analysis.notReady'; targetKey: string }
  | { type: 'analysis.failed'; message: string };

export type InstallError =
  | { type: 'install.noLockfile'; path: string }
  | { type: 'install.failed'; exitCode: number; stderrTail: string }
  | SpawnError;

export type ValidationError = { type: 'validation.invalid'; message: string };

export type NotFoundError = { type: 'notFound'; resource: string; id: string };

export type AppError =
  | GitError
  | GitHubError
  | FsError
  | LspError
  | AnalysisError
  | InstallError
  | ValidationError
  | NotFoundError;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
