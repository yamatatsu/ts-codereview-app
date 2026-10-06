# 0015. 永続化：レビュー状態は SQLite（node:sqlite と Drizzle）、設定は JSON

- Status: Accepted
- Date: 2026-10-05

## Context

永続化したいものは次のとおりです。

- Viewed（どの内容を見たか）
- 行メモ
- Project 一覧と PR worktree の管理情報
- 暗号化した PAT
- アプリ設定

これらは関係を持ち、検索も必要になります。Electron 44 は Node 24 を同梱しているので、`node:sqlite` が使える可能性が高いと見ています。

## Decision

- **レビュー状態などの構造化データ**：SQLite
  - 場所は `~/Library/Application Support/TSugi/tsugi.db`
  - ドライバーは `node:sqlite`（`DatabaseSync`）を第一候補とし、ORM とマイグレーションは Drizzle（drizzle-kit）を使う
  - Phase 0 のスパイクで「Electron 44 の main で `node:sqlite` が使えるか」「Drizzle の node:sqlite ドライバーで動くか」を確認する
  - 失敗したら **better-sqlite3** と `@electron/rebuild` に切り替える（ビルドを許可するパッケージに追加する）
- **アプリ全体の設定**（外部コマンドのパス、テーマ、除外 glob のデフォルトなど）：`settings.json`
  - zod でスキーマを検証する
- スキーマの概要は [specs/08](../specs/08-review-state.md) と [specs/01](../specs/01-projects-and-settings.md) を参照

## Consequences

- `node:sqlite` が使えればネイティブビルドが不要になり、サプライチェーンのリスクも減る

## 実装時の確認結果（2026-10-06）

- **スパイク B は成功**。Electron 44 の main で `node:sqlite`（`DatabaseSync`）が使えた。
- drizzle-orm 0.45（stable）には `node:sqlite` 用のドライバーがない。そのため `drizzle-orm/sqlite-proxy` から `DatabaseSync` を呼ぶ構成にした（`StatementSync#setReturnArrays(true)` で行を配列で返す）。better-sqlite3 は不要になり、ネイティブビルドもなくなった。
- マイグレーションは drizzle-kit を使わず、`PRAGMA user_version` で管理する SQL の配列にした（`db/migrations.ts`）。
- ローカルの作業ツリーの内容は git のオブジェクトに保存されていない（`hash-object` は `-w` なしで実行しているため）。そこで、Viewed にしたときとメモを作ったときの内容を `blob_snapshots` テーブルに保存し、差分の差分とメモの行追従に使う。ユーザーのリポジトリには書き込まない。
