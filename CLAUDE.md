# TSugi 開発ガイド（エージェント向け）

設計判断は `docs/adr/`、仕様は `docs/specs/`、実装計画は `docs/plans/` にあります。仕様を変えるときは、ADR と specs も更新してください。

## コマンド

- 静的チェック：`pnpm exec vp check`（`--fix` で整形と自動修正）
- テスト：`pnpm -C packages/core exec vp test`、`pnpm -C apps/desktop exec vp test`
- E2E：`pnpm -C apps/desktop exec vp run e2e`（ビルドしてから Electron を起動する）
- テストの import は `vite-plus/test` から行う（`vitest` を直接 import しない）

## 守ること

- エラーは throw せず、`@praha/byethrow` の `Result` で返す。エラー型は `packages/core/src/errors.ts` の判別可能なユニオンに追加する。使い方は byethrow の skill（`.claude/skills/byethrow`）を参照する
- 子プロセスは必ず `@tsugi/core` の `spawnSafe` / `spawnLongRunning` で起動する（絶対パス・shell なし・環境変数は許可リスト）。`node:child_process` の直接 import は lint で禁止している
- `packages/core` から `electron` を import しない
- GitHub のトークンはプロジェクトごとの PAT（safeStorage）だけを使う。環境変数や `gh auth token` は読まない
- 依存を追加するときは、厳密なバージョンで追加する（`saveExact`）。ビルドスクリプトが必要なら `pnpm-workspace.yaml` の `allowBuilds` に明示し、影響が大きいものは ADR に残す
- renderer と main の通信は `app://tsugi/api` の Hono RPC。ルートを追加するときは `respond()` と `validate()` を使い、`c.json` にはステータスを明示する（RPC の型を崩さないため）
