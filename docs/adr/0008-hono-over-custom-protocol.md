# 0008. Hono を `app://` カスタムプロトコルで提供する

- Status: Accepted
- Date: 2026-10-05

## Context

renderer と main の通信で、型安全と保守性を確保したいと考えています。Hono には Electron 専用のアダプターはありません。一方、Electron の `protocol.handle` は Fetch の `Request` を受け取り `Response` を返すので、`honoApp.fetch` をそのまま接続できます。

## Decision

- `app.whenReady()` の前に、次のスキームを登録する
  ```ts
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
  ```
- `protocol.handle('app', (req) => router(req))`
  - `app://api/*` は Hono に渡す
  - `app://renderer/*` は本番ビルドの静的ファイルを返す
- renderer は Hono RPC（`hc<AppType>('app://api/')`）を使い、TanStack Query と組み合わせる
- **main → renderer のプッシュ**は SSE で送る
  - `app://api/events` を Hono の `streamSSE` で実装する
  - イベント：`workspace.changed`、`analysis.progress`、`lsp.status`、`worktree.install.log` など。型は `src/shared/events.ts` に置く
- **開発時**は renderer が `http://localhost` から読み込まれるので、Hono の `cors()` で dev server の origin だけを許可する（本番では無効）
- **エラーの表現**：byethrow の `Result` の失敗は、HTTP ステータスと `{ error: { type, message, ... } }` の JSON に変換する。renderer 側でもう一度判別可能なユニオンとして扱う（[0009](./0009-errors-as-values-with-byethrow.md)）

## Consequences

- TCP ポートを開けないので、他のプロセスやブラウザからアクセスされない
- ストリーミング（SSE、大きな diff）がそのまま使える
- protocol は session ごとに登録される。デフォルトの session だけを使う

## Alternatives

- IPC 上に Request をシリアライズして載せる：自前の fetch アダプターが必要で、ストリーミングが難しいので不採用
- localhost の HTTP サーバー：ポートが公開されるので、セキュリティ方針（[0016](./0016-supply-chain-and-subprocess-hardening.md)）に反するため不採用

## 実装時の確認結果（2026-10-06）

- renderer（本番）と API を同じ origin `app://tsugi` に置いた（`app://tsugi/index.html` と `app://tsugi/api/*`）。これで本番では CORS が不要になり、開発時の dev server（`http://localhost:5199`）だけを許可している。
- SSE は `EventSource` ではなく、fetch のストリームを読む自前の実装（`renderer/lib/events.ts`）で受け取る。切断時は再接続する。
- Hono RPC の型について、2 点の注意がある。
  - `Result.isFailure` で絞り込んだ Result を汎用のヘルパーに渡すと、成功側が `unknown` と推論され、レスポンス型が JSON の任意の値に崩れる。そのため `respond` は、渡された Result 型から Success / Failure を取り出して `TypedResponse` を組み立てる。
  - zod バリデーターの失敗も、`validation.invalid` の AppError として返す（`api/validate.ts`）。
- E2E テスト専用に `TSUGI_GITHUB_API_URL`（GitHub API のベース URL）と `TSUGI_USER_DATA`（userData の場所）を環境変数で差し替えられるようにした。
