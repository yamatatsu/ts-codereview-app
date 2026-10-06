import { Result } from '@praha/byethrow';
import type { AppError } from '@tsugi/core';
import type { Context, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { JSONParsed } from 'hono/utils/types';

/** AppError を HTTP ステータスに対応づける（docs/specs/10） */
export const statusOf = (error: AppError): ContentfulStatusCode => {
  switch (error.type) {
    case 'notFound':
    case 'fs.notFound':
    case 'github.notFound':
    case 'git.revisionNotFound':
      return 404;
    case 'github.unauthorized':
      return 401;
    case 'github.forbidden':
    case 'fs.outsideWorkspace':
      return 403;
    case 'github.tokenMissing':
    case 'github.remoteNotConfigured':
    case 'github.encryptionUnavailable':
    case 'spawn.executableNotAllowed':
    case 'git.notARepository':
    case 'analysis.notReady':
    case 'lsp.notRunning':
      return 412;
    case 'validation.invalid':
      return 400;
    case 'lsp.timeout':
    case 'spawn.timeout':
      return 504;
    default:
      return 500;
  }
};

export type ErrorBody = { error: AppError };

/** エラー時のステータス（型の上では 200 以外として扱い、RPC クライアントで成功型と区別する） */
type ErrorStatus = Exclude<ContentfulStatusCode, 200>;

type SuccessOf<R> = R extends { type: 'Success'; value: infer V } ? V : never;
type FailureOf<R> = R extends { type: 'Failure'; error: infer X } ? X : never;

export type Respond<R> =
  | ([SuccessOf<R>] extends [never] ? never : TypedResponse<JSONParsed<SuccessOf<R>>, 200, 'json'>)
  | ([FailureOf<R>] extends [never]
      ? never
      : TypedResponse<JSONParsed<{ error: FailureOf<R> }>, ErrorStatus, 'json'>);

/**
 * Result を JSON レスポンスに変換する。
 * Failure に絞り込んだ Result を渡したときに成功側が unknown にならないよう、型は R から取り出す。
 */
// oxlint-disable-next-line byethrow/no-ambiguous-success-type -- 境界で任意の成功値を JSON にするヘルパー
export const respond = <R extends Result.Result<unknown, AppError>>(
  c: Context,
  result: R,
): Response & Respond<R> => {
  // oxlint-disable-next-line byethrow/no-ambiguous-success-type -- 同上
  const r = result as Result.Result<unknown, AppError>;
  return (
    Result.isSuccess(r)
      ? c.json(r.value, 200)
      : c.json({ error: r.error } as ErrorBody, statusOf(r.error) as ErrorStatus)
  ) as Response & Respond<R>;
};
