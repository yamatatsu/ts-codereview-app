# Phase 0：基盤とスパイク

## ゴール

開発環境を一式揃え、技術的に不確実な 3 点をスパイクで潰す。

## タスク

### 0-1. リポジトリの初期化

- [x] `git init` し、`.gitignore` を置く（`node_modules`、`dist`、`out`、`.DS_Store`、`*.log`）
- [x] ルートの `package.json` で Node と pnpm を pin する：`engines.node = "24.21.0"`、`packageManager = "pnpm@<最新の stable>"`。Vite+ のグローバル CLI がこの宣言から選ぶ
- [x] ルートの `package.json`：`"private": true`、`packageManager: "pnpm@<ver>"`、`engines.node`
- [x] `pnpm-workspace.yaml` を作る：`packages: [apps/*, packages/*]`、`minimumReleaseAge: 1440`、ビルド許可リスト、`strictDepBuilds: true`
  - [x] 使用する pnpm バージョンでの正しい設定名を公式ドキュメントで確認する（[ADR 0016](../adr/0016-supply-chain-and-subprocess-hardening.md)）

### 0-2. Vite+ と静的解析

- [x] `vite-plus` を devDependency に追加し、厳密に pin する
- [x] ~~`vp env off`~~ → グローバルの `vp` と shim を使わないので不要だった（ADR 0004 を参照）
- [x] `typescript@7` を追加し、`tsconfig.base.json` を作る（[ADR 0005](../adr/0005-typescript7-oxlint-oxfmt.md) の設定）
- [x] oxlint の設定：`typeAware`、`typeCheck`、`@praha/byethrow-oxlint`、`packages/core` からの `electron` の import を禁止、`child_process` の直接 import を禁止（`spawnSafe` の強制）
- [x] oxfmt の設定：import ソートと Tailwind のクラスソート
- [x] ルートにタスクを定義する：`vp run check` / `test` / `dev` / `build`

### 0-3. パッケージの雛形

- [x] `packages/core`：`package.json`（`exports` で `src/index.ts` を指す）、`tsconfig.json`、vitest の雛形、サンプルのテスト 1 本
- [x] `apps/desktop`：`src/{main,preload,analysis,renderer,shared}` のディレクトリ構成
- [x] `@praha/byethrow` と `@praha/byethrow-testing` を追加する
- [x] `pnpm dlx @praha/byethrow-docs init claude` を実行し、`.claude/skills/byethrow/SKILL.md` を生成する

### 0-4. スパイク A：Vite+ だけで Electron を起動する（[ADR 0004](../adr/0004-build-with-vite-plus-only.md)）

- [x] tsdown（`vp pack`）で main、preload、analysis をバンドルする（ESM、node24、`electron` は external）
- [x] renderer の Vite dev server と、自作の `scripts/dev-electron.ts`（出力を監視して Electron を再起動する）を `vp run dev` で並列に起動する
- [x] `utilityProcess.fork` で analysis が起動し、MessagePort で ping / pong できる
- [x] 本番ビルドの後、`electron-builder --dir --arm64` で `.app` が起動する
- **失敗した場合**：Electron Forge 8 での構成を検討する ADR を起こす

### 0-5. スパイク B：`node:sqlite` と Drizzle（[ADR 0015](../adr/0015-persistence.md)）

- [x] Electron 44 の main で `require('node:sqlite')` が使えるか
- [x] Drizzle の node:sqlite ドライバー（または同等の手段）で CRUD とマイグレーションが動くか
- [x] パッケージングした `.app` でも動くか
- 結果：`node:sqlite` は動いた。drizzle には専用ドライバーがないため `sqlite-proxy` 経由にした（ADR 0015）

### 0-6. スパイク C：@pierre/diffs（[ADR 0017](../adr/0017-diff-viewer-pierre-diffs.md)）

- [x] React で split と unified の diff を表示する
- [x] 変更されていないファイルを全文表示できるか
- [x] `onTokenClick` から行・列を取得し、LSP の Position（UTF-16）に変換できるか（サロゲートペアを含む行で確認する）
- [x] annotation の仕組みで、行にカスタムの React 要素を表示できるか
- **失敗した場合**：全文表示を Shiki で自作する

### 0-7. スパイク D（小）：`tsc --lsp`

- [x] 同梱した `typescript@7` の `tsc --lsp --stdio` を spawn し、`initialize` と `definition` が返ることを、Node 単体のスクリプトで確認する

### 0-8. CI とフック

- [x] `.github/workflows/ci.yml`：setup-vp → `vp install --frozen-lockfile` → `vp check` → `vp test`
- [x] pre-commit：Vite+ の `vp hooks` と `vp staged` を使う（lefthook は不要）

## 完了条件

- `vp run dev` で空の React 画面を持つ Electron が起動し、ホットリロードが効く
- `vp check` と `vp test` が CI で通る
- スパイク A〜D の結果を ADR に追記する（Accepted のままか、Superseded か）
