# 0004. ビルドは Vite+ だけで組む（electron-vite 不採用）

- Status: Accepted
- Date: 2026-10-05

## Context

- Vite+（VoidZero）は 2026-09-28 に 1.0 GA になった。MIT ライセンスで、`vp` CLI に Vite 8、Vitest 5、Oxlint、Oxfmt、Rolldown、tsdown、Vite Task を同梱している
- Vite+ は Electron 対応を明言していない
- electron-vite の stable 版（5.x）は Vite 7 までしか対応しておらず、Vite 8 対応は 6.0 beta のみ。メンテナーも実質 1 人
- Electron Forge 8 の plugin-vite は experimental のまま
- mise のレジストリに Vite+ は未登録（issue #943）

## Decision

electron-vite と Forge は使わず、**Vite+ に同梱されたツールだけで**ビルドを組む。

| 対象                              | ツール                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| renderer（React）                 | Vite 8（`vp dev` / `vp build`）                                                                                                   |
| main / preload / analysis utility | tsdown（`vp pack`）。ESM、`platform: node`、`electron` と native モジュールは external                                            |
| 開発時の起動                      | Vite Task（`vp run dev`）で「renderer の dev server」「tsdown の watch」「Electron ランチャー」を並列に実行する                   |
| Electron ランチャー               | 自作スクリプト（`apps/desktop/scripts/dev-electron.ts`）。main / preload のビルド出力を監視し、変更があれば Electron を再起動する |
| パッケージング                    | electron-builder 26（stable）で `--dir --arm64` を指定し、署名なし（ad-hoc）の `.app` を作る                                      |

Vite+ の導入方法：

- グローバルの `curl | bash` は使わない
- `vite-plus` を各 workspace の devDependency に入れる（バージョンは厳密に pin）
- Node は mise に任せる。`vp env off` を実行して、Vite+ に Node を管理させない

## Consequences

- beta の依存がなくなり、リスクを Vite+ 1.0 GA に集約できる
- electron-vite が提供していた便利機能（preload の自動リロード、環境変数の注入）を自作する必要がある。規模は数十行
- 開発時の renderer は `http://localhost:<port>`、本番は `app://` から読み込まれる。このため開発時のみ、Hono 側で CORS を許可する必要がある（[0008](./0008-hono-over-custom-protocol.md)）

## Alternatives

- electron-vite 6 beta と electron-builder：beta のリスクがあり、メンテナーへの依存が大きいので不採用
- Electron Forge 8 と plugin-vite：experimental で、Vite のバージョン追従も不明なので不採用

## Revisit when

- Vite+ が公式に Electron サポートを入れたとき
- Phase 0 のスパイク（tsdown でバンドルした main で Electron が起動するか）が失敗したとき → Forge を再検討する

## 実装時の確認結果（2026-10-06）

- **スパイク A は成功**。tsdown（`vp pack`）で main / analysis を ESM、preload を CJS（sandbox 用）にバンドルし、Electron 44 で起動できた。開発時は `scripts/dev.ts` が Vite の dev server、`vp pack --watch`、Electron の再起動を束ねる（`vp run dev`）。
- `@tsugi/core` だけをバンドルに含め、それ以外の依存は external にする（`deps.alwaysBundle` / `deps.neverBundle`）。external の依存はパッケージングに同梱されるよう `apps/desktop` の dependencies に置く。
- Vite+ のドキュメント（`node_modules/vite-plus/docs/guide/local-cli.md`）に従い、pnpm の overrides で `vite` を `@voidzero-dev/vite-plus-core` にエイリアスし、`vitest` を同梱版（5.0.1）に pin した。これがないと plugin 経由で別の vite / vitest が入り、型が分裂する。
- Vite+ はグローバルの `vp` を入れず devDependency のみで使うので、`vp env off` は不要だった（shim を使わないため）。
- electron-builder の依存収集は `*.d.ts` を除外するため、ネイティブ版 tsc が必要とする `lib*.d.ts` を `scripts/after-pack.cjs` で `app.asar.unpacked` にコピーする。
