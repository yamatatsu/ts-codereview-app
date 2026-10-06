# Phase 3：コードジャンプ

## ゴール

head 側で、VS Code と同じ感覚で定義・参照を辿れる状態にする。

## タスク

### core

- [x] `LspClient`：stdio の JSON-RPC（`vscode-jsonrpc`）、`initialize` / `initialized` / `shutdown`、リクエストのキューイング、タイムアウト
- [x] `LspSession`：`didOpen` の LRU 管理（50 件）、`definition` / `typeDefinition` / `references` / `hover` / `documentSymbol`、URI とパスの変換
- [x] 戻り値はすべて `ResultAsync<_, LspError>`
- [x] 統合テスト：fixture の monorepo（project references、workspace パッケージ、tsconfig の paths）でパッケージをまたぐ定義ジャンプ

### main

- [x] `LspManager`：Workspace ごとに起動、状態遷移、10 分アイドルで停止、異常終了時に最大 3 回まで再起動、SSE `lsp.status`
- [x] 同梱した `typescript` のバイナリパスを解決する（パッケージング後に `asarUnpack` が必要か確認する）
- [x] watcher の通知を `workspace/didChangeWatchedFiles` に転送する
- [x] API：`/targets/:key/lsp/*`、`/targets/:key/fs/:path`（パストラバーサル対策、node_modules の `.d.ts` も許可）

### renderer

- [x] トークンのホバーで hover ポップオーバー、`Cmd+Click` / `F12` で定義ジャンプ、`Shift+F12` で参照をパネルに表示、`Alt+F12` でピーク表示
- [x] Code view（変更されていないファイルと `.d.ts` の全文表示）
- [x] ジャンプ履歴（Zustand）、`Ctrl+-` / `Ctrl+Shift+-`
- [x] base 側のトークンはジャンプ不可として表示を区別する
- [x] ステータスバーに LSP の状態を表示する

## 完了条件

- fixture と実リポジトリ（自分の monorepo を 1 つ）で、定義、参照、hover、戻る・進むが動く
