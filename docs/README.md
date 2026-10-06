# TSugi 設計ドキュメント

TSugi は TypeScript コードのレビューで「読む効率」を上げるための、macOS（Apple Silicon）向け Electron アプリです。

名前の由来：

- **TS**：TypeScript の頭文字
- **接ぎ**：実装・テスト・依存を繋いで読める
- **次**：次に読むものが明示される

## 構成

| ディレクトリ         | 内容                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| [`adr/`](./adr/)     | Architecture Decision Records（MADR の簡略版）。なぜその技術・方式を選んだか |
| [`specs/`](./specs/) | 機能仕様。何を作るか、どう振る舞うか                                         |
| [`plans/`](./plans/) | フェーズごとの実装計画。どの順で、何をもって完了とするか                     |

## 用語集

| 用語         | 意味                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Project      | TSugi に登録された、ローカルの git clone 1 つ。PAT や除外 glob などの設定はここに紐づく                             |
| ReviewTarget | レビュー対象の差分。`base..head` の 2 つのリビジョンと、解析に使う作業ディレクトリ（Workspace）の組                 |
| Workspace    | ReviewTarget の head 側のファイルが実在するディレクトリ。ローカル差分なら clone 本体、PR なら TSugi が作る worktree |
| ChangedFile  | ReviewTarget に含まれる変更ファイル。status（A/M/D/R）と種別（impl / test / collapsed）を持つ                       |
| TestLink     | 実装ファイルとテストファイルの対応。`primary`（命名一致）と `indirect`（import のみ）の 2 種類                      |
| ImportGraph  | Workspace 全体のモジュール依存グラフ。base と head の 2 つを作る                                                    |
| ReviewOrder  | ImportGraph から算出した、変更ファイルの推奨閲読順（依存の葉から読む）                                              |
| Viewed       | ファイルを「見た」という記録。どの blob（内容ハッシュ）を見たかを保持する                                           |
| Note         | 行に紐づくプライベートなメモ。GitHub には送らない                                                                   |

## ADR 一覧

| #                                                           | タイトル                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| [0001](./adr/0001-record-architecture-decisions.md)         | ADR で設計判断を記録する                                             |
| [0002](./adr/0002-product-scope.md)                         | プロダクトスコープ：自分専用・読み取り専用・AI なし                  |
| [0003](./adr/0003-runtime-and-toolchain.md)                 | ランタイムとツールチェイン：Vite+ / Node 24 / pnpm / Electron 44     |
| [0004](./adr/0004-build-with-vite-plus-only.md)             | ビルドは Vite+ だけで組む（electron-vite 不採用）                    |
| [0005](./adr/0005-typescript7-oxlint-oxfmt.md)              | TypeScript 7 と oxlint（type-aware）・oxfmt                          |
| [0006](./adr/0006-monorepo-layout.md)                       | pnpm workspace で `apps/desktop` と `packages/core` に分ける         |
| [0007](./adr/0007-process-architecture.md)                  | プロセス構成：main / analysis utility / 子プロセス / renderer        |
| [0008](./adr/0008-hono-over-custom-protocol.md)             | Hono を `app://` カスタムプロトコルで提供する                        |
| [0009](./adr/0009-errors-as-values-with-byethrow.md)        | byethrow によるエラーの値化                                          |
| [0010](./adr/0010-ts-analysis-with-bundled-tsc-lsp.md)      | コード解析は同梱した TS7 の `tsc --lsp` で行う                       |
| [0011](./adr/0011-import-graph-with-oxc.md)                 | import グラフは oxc-parser と oxc-resolver で作る                    |
| [0012](./adr/0012-git-via-cli.md)                           | git 操作はシステムの git CLI を使う                                  |
| [0013](./adr/0013-github-auth-per-project-pat.md)           | GitHub 認証はプロジェクトごとの PAT のみ                             |
| [0014](./adr/0014-pr-worktree-and-dependency-install.md)    | PR は worktree に展開し、`--ignore-scripts` で依存を入れる           |
| [0015](./adr/0015-persistence.md)                           | 永続化：レビュー状態は SQLite（node:sqlite と Drizzle）、設定は JSON |
| [0016](./adr/0016-supply-chain-and-subprocess-hardening.md) | サプライチェーン対策と子プロセスの隔離                               |
| [0017](./adr/0017-diff-viewer-pierre-diffs.md)              | diff ビューアに @pierre/diffs を使う                                 |
| [0018](./adr/0018-renderer-libraries.md)                    | renderer のライブラリ構成                                            |
| [0019](./adr/0019-testing-ci-logging.md)                    | テスト・CI・ログの方針                                               |

## Specs 一覧

- [00 全体像と画面構成](./specs/00-overview.md)
- [01 プロジェクトと設定](./specs/01-projects-and-settings.md)
- [02 ReviewTarget とローカル差分](./specs/02-review-target.md)
- [03 diff 表示](./specs/03-diff-viewer.md)
- [04 コードナビゲーション](./specs/04-code-navigation.md)
- [05 テストと実装の対応](./specs/05-test-mapping.md)
- [06 依存グラフとレビュー順](./specs/06-dependency-graph.md)
- [07 GitHub PR レビュー](./specs/07-github-pr.md)
- [08 レビュー状態（Viewed とメモ）](./specs/08-review-state.md)
- [09 キーボードショートカット](./specs/09-keybindings.md)
- [10 内部 API（Hono）](./specs/10-internal-api.md)

## 実装計画一覧

| Phase                                       | 内容                      |
| ------------------------------------------- | ------------------------- |
| [0](./plans/0000-phase0-foundation.md)      | 基盤とスパイク            |
| [1](./plans/0001-phase1-app-skeleton.md)    | アプリの骨格              |
| [2](./plans/0002-phase2-local-diff.md)      | ローカル差分レビュー      |
| [3](./plans/0003-phase3-code-navigation.md) | コードジャンプ            |
| [4](./plans/0004-phase4-import-graph.md)    | import グラフと依存ビュー |
| [5](./plans/0005-phase5-test-mapping.md)    | テストと実装の分離・往来  |
| [6](./plans/0006-phase6-github-pr.md)       | GitHub PR                 |
| [7](./plans/0007-phase7-review-state.md)    | レビュー状態              |
| [8](./plans/0008-phase8-polish.md)          | 仕上げ                    |
