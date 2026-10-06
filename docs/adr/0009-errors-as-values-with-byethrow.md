# 0009. byethrow によるエラーの値化

- Status: Accepted
- Date: 2026-10-05

## Context

git、GitHub、ファイルシステム、LSP など、失敗しうる I/O が多いアプリです。throw ベースだと失敗の種類が型に現れず、UI で適切に出し分けられません。

## Decision

- `@praha/byethrow` を **core と main の全域で**使う。失敗しうる関数は `Result.Result<T, E>` か `Result.ResultAsync<T, E>` を返す
- throw する外部ライブラリは、境界で `Result.fn({ try, catch })` で包む
- エラーは判別可能なユニオンで定義し、`type` フィールドで区別する
  ```ts
  type GitError =
    | { type: 'git.notARepository'; path: string }
    | { type: 'git.revisionNotFound'; rev: string }
    | { type: 'git.commandFailed'; args: string[]; exitCode: number; stderr: string };
  type GitHubError = { type: 'github.tokenMissing' } | { type: 'github.unauthorized' } | { type: 'github.notFound'; resource: string } | ...;
  type AnalysisError = ...; type LspError = ...; type InstallError = ...;
  ```
- throw を許すのは次の 2 か所だけ：
  - Hono のハンドラーの境界：`Result` を HTTP レスポンスに変換する
  - バグ（到達不能なコード）
- renderer では、Hono RPC のレスポンスを `Result` に戻すヘルパーを用意し、UI は `type` で分岐する
- 補助パッケージ：
  - `@praha/byethrow-oxlint`：lint プリセット
  - `@praha/byethrow-testing`：vitest 用 matcher
- Claude Code 用の skill を `pnpm dlx @praha/byethrow-docs init claude` で生成する（`.claude/skills/byethrow/SKILL.md`）

## Consequences

- 失敗が型に現れ、UI でのエラー表示（「gh 未ログイン」ではなく「PAT が未設定」など）を網羅できる
- `Result.pipe` に慣れるコストがかかる
