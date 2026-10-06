# 10. 内部 API（Hono）

`app://api/` で提供します（[ADR 0008](../adr/0008-hono-over-custom-protocol.md)）。ルートは `apps/desktop/src/main/api/` に置き、`AppType` を `src/shared` から export します。

## エンドポイント（初期案）

| Method                      | Path                                   | 説明                                                                              |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| GET                         | `/projects`                            | Project 一覧                                                                      |
| POST                        | `/projects`                            | 登録（`{ rootPath }`）                                                            |
| PATCH                       | `/projects/:id`                        | 設定の更新                                                                        |
| DELETE                      | `/projects/:id`                        | 削除                                                                              |
| PUT                         | `/projects/:id/pat`                    | PAT の保存（疎通確認つき）                                                        |
| DELETE                      | `/projects/:id/pat`                    | PAT の削除                                                                        |
| GET                         | `/projects/:id/branches`               | ローカルブランチの一覧                                                            |
| GET                         | `/projects/:id/pulls`                  | PR 一覧                                                                           |
| POST                        | `/projects/:id/targets/resolve`        | ReviewTarget を解決し、ResolvedTarget を返す（PR なら worktree の準備を開始する） |
| GET                         | `/targets/:key/files/:path/blobs`      | base と head の内容（`?side=base                                                  | head`） |
| GET                         | `/targets/:key/fs/:path`               | Workspace 内の任意のファイル（Code view 用。node_modules の `.d.ts` も含む）      |
| POST                        | `/targets/:key/lsp/definition`         | `{ path, line, character }` → Location[]                                          |
| POST                        | `/targets/:key/lsp/references`         | 同上                                                                              |
| POST                        | `/targets/:key/lsp/hover`              | 同上                                                                              |
| GET                         | `/targets/:key/lsp/symbols/:path`      | documentSymbol                                                                    |
| GET                         | `/targets/:key/graph`                  | `?hops=1&tests=true&typeOnly=true`                                                |
| GET                         | `/targets/:key/review-order`           | ReviewOrder                                                                       |
| GET                         | `/targets/:key/test-links`             | TestLink[]                                                                        |
| GET                         | `/targets/:key/test-outline/:path`     | テストのアウトライン                                                              |
| PUT / DELETE                | `/targets/:key/viewed/:path`           | Viewed の設定 / 解除（`{ blobSha }`）                                             |
| GET / POST / PATCH / DELETE | `/targets/:key/notes`                  | メモの CRUD                                                                       |
| GET / PATCH                 | `/settings`                            | アプリ設定                                                                        |
| POST                        | `/settings/executables/detect`         | 実行ファイルの自動検出                                                            |
| GET                         | `/worktrees` / DELETE `/worktrees/:id` | worktree の管理                                                                   |
| GET                         | `/events`                              | SSE                                                                               |
| POST                        | `/logs`                                | renderer のエラーログ                                                             |

- `:key` は ReviewTarget のキー（例：`<projectId>:pr:123`）を URL エンコードしたもの
- ファイルを返すエンドポイントは、パスが Workspace の外を指していないか（パストラバーサル）を検証する
- バリデーションには `@hono/zod-validator` を使う

## エラーレスポンス

```json
{ "error": { "type": "github.unauthorized", "message": "..." } }
```

- ステータスの対応：`*.notFound` は 404、`*.unauthorized` は 401、`*.tokenMissing` は 412、検証エラーは 400、`*.commandFailed` は 500

## SSE イベント

```ts
type ServerEvent =
  | { type: 'workspace.changed'; targetKey: string }
  | {
      type: 'analysis.progress';
      targetKey: string;
      phase: 'graph' | 'testLinks';
      done: number;
      total: number;
    }
  | {
      type: 'lsp.status';
      targetKey: string;
      status: 'starting' | 'indexing' | 'ready' | 'error';
      message?: string;
    }
  | { type: 'worktree.install.log'; targetKey: string; line: string }
  | { type: 'worktree.install.done'; targetKey: string; result: 'ok' | 'fallback' | 'failed' }
  | { type: 'pr.headChanged'; targetKey: string; newHeadSha: string };
```
