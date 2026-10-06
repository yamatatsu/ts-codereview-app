# Phase 8：仕上げ

## タスク

- [x] E2E（Playwright の `_electron`）：Project の登録 → ローカル差分 → 定義ジャンプ → 戻る、テストの切り替え、依存グラフ、Viewed
- [x] パッケージング：`electron-builder --dir --arm64`
  - 同梱する `typescript` のネイティブバイナリと、@parcel/watcher の `asarUnpack` を確認する（lib*.d.ts は `scripts/after-pack.cjs` でコピーする）
  - `productName: TSugi`、`appId: local.tsugi`（アプリのアイコンは未作成で、Electron の既定アイコンのまま）
- [x] 性能計測：`microsoft/vscode`（解析対象 14,394 ファイル、エッジ 147,388 本）で計測した（`TSUGI_PERF_REPO=... vp test src/graph/real-repo.perf.test.ts`）
  - `git ls-files`：197ms ／ import グラフの初回構築：3.5 秒 ／ `tsc --lsp` の起動から最初の応答（documentSymbol）まで：2.3 秒
  - いずれも analysis の utility process と子プロセスで動くので、UI は止まらない。現時点で改善は不要と判断した
- [x] エラー UX の総点検：全 `AppError` の `type` に対して、ユーザー向けのメッセージと対処方法があるか確認する
- [x] ドキュメント：README（セットアップ、ビルド、`xattr` による quarantine の解除）、ADR の最新化

## 将来の候補（スコープ外、[ADR 0002](../adr/0002-product-scope.md)）

- base 側でのコードジャンプ
- PR へのコメントとレビューの投稿
- `keybindings.json` によるキーの上書き
- 対象リポジトリの TS を使う LSP 経路（`typescript-language-server`）
- LLM による変更要約
