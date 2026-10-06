# 0019. テスト・CI・ログの方針

- Status: Accepted
- Date: 2026-10-05

## Decision

### テスト

- **core**：vitest（`vp test`）
  - ユニットテスト：パース処理、ReviewOrder、TestLink の判定など
  - 統合テスト：テスト内で一時ディレクトリに fixture リポジトリを `git init` で生成し、GitClient、ImportGraph、TestLink を検証する
  - LSP 統合テスト：同梱の `tsc --lsp` を fixture に対して起動し、definition / references を検証する
  - `Result` のアサーションには `@praha/byethrow-testing` を使う
- **renderer**：vitest と Testing Library。キーマップ、ジャンプ履歴、ファイル一覧のグルーピングなどのロジックに絞る
- **E2E**：Playwright の `_electron`。主要フローを数本（Phase 8 で作成し、ローカルでのみ実行）
- 開発手法は TDD を基本にする

### CI

- GitHub Actions で、ubuntu-latest 上で `pnpm install --frozen-lockfile`、`vp check`、`vp test` を実行する
  - Node・pnpm・Vite+ は `voidzero-dev/setup-vp` で導入する（`package.json` の宣言から選ぶ。docs/adr/0003）
  - 外部の Action はタグではなくコミット SHA で固定し、バージョンはコメントで添える（タグの付け替えによるサプライチェーン攻撃を避ける。docs/adr/0016 と同じ方針）
  - トークンの権限は `contents: read` だけにする（public リポジトリで fork からの PR を受けても書き込めない）
- Electron の E2E とパッケージングは CI では実行しない

### Git フック

- pre-commit で `vp check`（ステージされたファイルのみ）を実行する
  - Vite+ にフック機能があればそれを使い、なければ lefthook を使う（Phase 0 で確認する）

### ログ

- main と analysis のログは `~/Library/Logs/TSugi/` に JSON Lines 形式で出力し、ローテーションする
  - PAT や Authorization ヘッダーはマスクする
- renderer のエラーは `app://api/logs` 経由で main に送る

## 実装時の確認結果（2026-10-06）

- pre-commit は Vite+ の `vp hooks` と `vp staged` で実現した（`.vite-hooks/pre-commit`）。lefthook は不要だった。
- E2E は vitest と Playwright の `_electron` で、ビルド済みのアプリを一時的な userData で起動する（`vp run e2e`）。
  - GitHub PR のフローは、モックの GitHub API と、`refs/pull/N/head` を持つローカルの upstream で検証する。
  - `TSUGI_E2E_PACKAGED=1` を付けると、パッケージ版の `.app` に対して同じテストを実行する。
  - `TSUGI_E2E_GITHUB=1` を付けると、本物の GitHub に対するテスト（`e2e/github-live.e2e.ts`）も実行する（2026-10-06 追加）。
    - public の fixture リポジトリ `yamatatsu/tsugi-e2e-fixture` の draft PR #1（閉じない・マージしない）を読むだけで、GitHub には書き込まない。
    - 確認すること：origin からのリポジトリ判定、無効な PAT を保存しないこと、PR 一覧、worktree への展開とオフライン install、テスト対応付け、定義ジャンプ、worktree と ref の後始末。
    - PAT はテストが `GH_TOKEN` から読み、設定画面と同じ API でアプリに渡す。アプリ自身は環境変数を読まない（docs/adr/0013）。
    - CI では実行しない（PAT を Actions の secret に置かないため）。
