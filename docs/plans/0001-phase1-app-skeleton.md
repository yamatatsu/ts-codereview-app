# Phase 1：アプリの骨格

## ゴール

renderer と main の型付きの通信路、永続化、設定、Project の登録ができている状態にする。

## タスク

### core

- [x] エラー型の基盤：`AppError` のユニオンと、カテゴリごとの型（`git.*`、`github.*`、`fs.*`、`settings.*`）
- [x] `spawnSafe(executable, args, { cwd, env? })`
  - 絶対パスを検証し、環境変数は許可リスト方式、`shell` は使わない
  - 戻り値は `ResultAsync<{ stdout, stderr, exitCode }, SpawnError>`
  - ストリーミングにも対応する
- [x] `detectExecutables()`：固定の候補リストから探し、`--version` で検証する
- [x] `GitClient` の最小版：`revParse`、`showToplevel`、`remoteUrl`、`listBranches`
- [x] DB スキーマ（Drizzle）：`projects`、`review_targets`、`pr_worktrees`、`viewed`、`notes`、マイグレーション
- [x] テスト：`spawnSafe` の環境変数フィルタ、fixture リポジトリでの GitClient

### main

- [x] `protocol.registerSchemesAsPrivileged` と `protocol.handle('app')`：`app://api/*` は Hono、`app://renderer/*` は静的ファイル
- [x] Hono app：エラーをレスポンスに変換するミドルウェア（`Result` → JSON）、開発時のみの CORS、zod-validator
- [x] SSE `/events`：イベントバス（main 内の型付き EventEmitter）から `streamSSE` で配信する
- [x] Settings：`settings.json` の読み書き（zod で検証）
- [x] Project API：CRUD、`/settings/executables/detect`
- [x] `safeStorage` の可否を確認し、PAT の保存 API を作る（疎通確認は Phase 6）
- [x] ログ：JSON Lines、ローテーション、マスク処理
- [x] セキュリティ：`sandbox`、`contextIsolation`、CSP、ナビゲーションの制限

### renderer

- [x] Tailwind v4 と shadcn の init（new-york、ダークモード）
- [x] TanStack Router（hash）、TanStack Query、`hc<AppType>` クライアント、`Result` に戻すヘルパー
- [x] SSE の購読を `invalidateQueries` につなぐ
- [x] 画面：オンボーディング（実行ファイルの検出結果）、Project 一覧と登録、アプリ設定、プロジェクト設定
- [x] 3 ペインのレイアウトの枠（中身は空）とステータスバー
- [x] キーマップの層（コマンド ID とキーの対応、コマンドパレット `Cmd+Shift+P`）

## 完了条件

- Project を登録し、アプリを再起動しても残っている
- 未署名の `.app` で `safeStorage.isEncryptionAvailable()` の結果を確認し、ADR 0013 に記録している
- renderer から main へのエラーが、型付きで UI に表示される
