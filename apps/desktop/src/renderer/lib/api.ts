import type { AppError } from '@tsugi/core';
import { hc, type ClientResponse } from 'hono/client';
import type { ResponseFormat } from 'hono/types';

import type { AppType } from '../../main/api/app';

export const API_ORIGIN = 'app://tsugi';

export const client = hc<AppType>(API_ORIGIN);
export const api = client.api;

/** API のエラー（判別可能なユニオンの AppError を保持する） */
export class ApiError extends Error {
  readonly error: AppError;
  readonly status: number;

  constructor(error: AppError, status: number) {
    super(describeError(error));
    this.error = error;
    this.status = status;
  }
}

/** 成功（200）レスポンスのボディ型だけを取り出す */
type OkBody<R> =
  R extends ClientResponse<infer T, infer S, infer _F>
    ? 200 extends S
      ? Exclude<T, { error: AppError }>
      : never
    : never;

/** Hono RPC のレスポンスを値か ApiError に変換する */
export const unwrap = async <R extends ClientResponse<unknown, number, ResponseFormat>>(
  promise: Promise<R>,
): Promise<OkBody<R>> => {
  const response = await promise;
  const body = (await response.json()) as { error?: AppError; success?: boolean; error_?: unknown };
  if (!response.ok || (body && typeof body === 'object' && 'error' in body && body.error)) {
    const error: AppError =
      body && typeof body.error === 'object' && body.error !== null && 'type' in body.error
        ? body.error
        : { type: 'validation.invalid', message: `HTTP ${response.status}` };
    throw new ApiError(error, response.status);
  }
  return body as OkBody<R>;
};

/** エラーの種類ごとのユーザー向けメッセージ（docs/plans/0008 のエラー UX） */
export const describeError = (error: AppError): string => {
  switch (error.type) {
    case 'git.notARepository':
      return `git リポジトリではありません: ${error.path}`;
    case 'git.revisionNotFound':
      return `リビジョンが見つかりません: ${error.rev}`;
    case 'git.commandFailed':
      return `git ${error.args.slice(0, 2).join(' ')} が失敗しました: ${error.stderr || `exit ${error.exitCode}`}`;
    case 'spawn.executableNotAllowed':
      return `${error.executable} の実行ファイルが設定されていません。設定画面でパスを指定してください。`;
    case 'spawn.failedToStart':
      return `${error.executable} を起動できませんでした: ${error.message}`;
    case 'spawn.timeout':
      return `${error.executable} がタイムアウトしました`;
    case 'github.tokenMissing':
      return 'GitHub の PAT が未設定です。プロジェクト設定で PAT を登録してください。';
    case 'github.encryptionUnavailable':
      return 'Keychain による暗号化が使えないため、PAT を扱えません。';
    case 'github.unauthorized':
      return 'PAT が無効か期限切れです。プロジェクト設定で PAT を更新してください。';
    case 'github.forbidden':
      return 'PAT の権限が不足しています（Contents / Pull requests / Metadata の read が必要です）。';
    case 'github.notFound':
      return `GitHub 上に見つかりません: ${error.resource}（PAT の対象リポジトリも確認してください）`;
    case 'github.remoteNotConfigured':
      return 'GitHub リモート（owner/repo）が設定されていません。';
    case 'github.requestFailed':
      return `GitHub API エラー (${error.status}): ${error.message}`;
    case 'fs.notFound':
      return `ファイルが見つかりません: ${error.path}`;
    case 'fs.outsideWorkspace':
      return `Workspace の外のファイルは開けません: ${error.path}`;
    case 'fs.readFailed':
      return `ファイルを読めませんでした: ${error.path}`;
    case 'lsp.notRunning':
      return 'TypeScript の言語サーバーが起動していません';
    case 'lsp.timeout':
      return `TypeScript の言語サーバーが応答しません（${error.method}）`;
    case 'lsp.requestFailed':
      return `言語サーバーのエラー: ${error.message}`;
    case 'analysis.notReady':
      return '解析中です。しばらくお待ちください。';
    case 'analysis.failed':
      return `内部エラー: ${error.message}`;
    case 'install.noLockfile':
      return 'lockfile が見つからないため依存をインストールできません';
    case 'install.failed':
      return `依存のインストールに失敗しました (exit ${error.exitCode})`;
    case 'validation.invalid':
      return error.message;
    case 'notFound':
      return `${error.resource} が見つかりません`;
  }
};

export const errorText = (error: unknown): string =>
  error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error);
