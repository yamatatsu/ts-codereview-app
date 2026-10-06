# 0006. pnpm workspace で `apps/desktop` と `packages/core` に分ける

- Status: Accepted
- Date: 2026-10-05

## Context

git、解析、ドメインロジックを Electron から切り離しておくと、Node 単体の vitest でテストしやすくなります。将来 CLI や VS Code 拡張に転用することもできます。一方で、パッケージを細かく分けすぎると設定の重複が増えます。

## Decision

```
.
├── mise.toml
├── pnpm-workspace.yaml
├── package.json            # ルートは vp run のタスク定義のみ
├── apps/
│   └── desktop/            # Electron アプリ（main / preload / analysis / renderer）
│       ├── src/main/
│       ├── src/preload/
│       ├── src/analysis/   # utility process のエントリ
│       ├── src/renderer/   # React + shadcn
│       └── src/shared/     # Hono の AppType、SSE イベント型など
└── packages/
    └── core/               # Electron 非依存。git、ReviewTarget、ImportGraph、TestLink、LSP クライアント、DB スキーマ
```

- `packages/core` は `electron` を import してはならない。oxlint の `no-restricted-imports` で強制する
- Hono のルート定義は `apps/desktop/src/main/api/` に置き、ロジックは core に委譲する
- shadcn のコンポーネントは `apps/desktop/src/renderer/components/ui/` に置く（独立したパッケージにはしない）

## Consequences

- core を統合テスト（fixture リポジトリを使う）で厚くテストできる
- workspace 間の依存は `workspace:*` で解決する。core は tsdown でビルドせず、ソースを直接参照する（`exports` で `.ts` を指す）
