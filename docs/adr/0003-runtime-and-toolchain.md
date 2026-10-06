# 0003. ランタイムとツールチェイン：Vite+ / Node 24 / pnpm / Electron 44

- Status: Accepted
- Date: 2026-10-05

## Context

2026-10-05 時点のバージョン状況：

- Electron の最新 stable は 44.5.1 で、Node 24.21.0（Chrome 152）を同梱している
- Node の Active LTS は 24.21.0 で、26 は 2026-10-28 に LTS 化する予定
- Vite+ のグローバル CLI（`vp`）は、プロジェクトの宣言から Node と pnpm のバージョンを選んで起動できる（`vp env`）

## Decision

- Node と pnpm のバージョンは **Vite+ のグローバル CLI** に選ばせる。宣言はルートの `package.json` にまとめる
  ```json
  {
    "engines": { "node": "24.21.0" },
    "packageManager": "pnpm@12.9.1"
  }
  ```
  - `engines.node` は Electron 44 同梱の Node と一致させる
  - `devEngines.runtime` は使わない（pnpm も同じ宣言で Node を管理しようとし、二重管理になるため）
- **パッケージマネージャーは pnpm**
- CI では `voidzero-dev/setup-vp` が同じ宣言から Node と pnpm を揃える（docs/adr/0019）
- **Electron 44.x** を使う
- 開発時の Node のメジャーバージョンは、Electron 同梱の Node と常に揃える

## Consequences

- core のテスト（vitest、Node 上）と本番（Electron 内の Node）で挙動が揃う
- Node 26 の新機能は、Node 26 系を同梱する Electron（45 以降の見込み）に上げるまで使えない

## Alternatives

- Node 26：開発ツールは新しくなるが、実行環境とずれるので不採用

## Revisit when

- Electron が Node 26 系を同梱したとき（Node と Electron を同時に上げる）

## 実装時の確認結果（2026-10-06）

- `engines.node` は `24.21.0`、`packageManager` は `pnpm@12.9.1` で pin した（pnpm は 12 系が最新の stable だった）。
- `vp env current` で、Node が `engines.node`、pnpm が `packageManager` から選ばれることを確認済み。
- Electron 44.5.1 の main で `process.versions.node` が `24.21.0` であることを確認済み。
