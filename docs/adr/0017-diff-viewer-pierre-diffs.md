# 0017. diff ビューアに @pierre/diffs を使う

- Status: Accepted
- Date: 2026-10-05

## Context

表示は読み取り専用です。レビュー UI に必要なのは、split / unified 表示、シンタックスハイライト、行への注釈（メモ）、大きなファイルの仮想化、そしてトークンクリックでのジャンプです。

## Decision

- **@pierre/diffs**（Shiki ベース、Apache-2.0）を採用する
  - `@pierre/diffs/react` のコンポーネントを使う
  - ハイライトは `@pierre/diffs/worker` で Web Worker にオフロードする
  - トークンのクリックとホバーのフック（`onTokenClick` / `onTokenEnter`）から、行と列を割り出して LSP の `definition` / `hover` を呼ぶ
  - メモは annotation の仕組みで行に表示する
- Phase 0 のスパイクで次の 2 点を検証する
  1. 変更されていないファイル（ジャンプ先）を全文表示できるか
  2. トークンの位置から LSP の Position（0 始まりの行、UTF-16 の文字位置）に正確に変換できるか
- 1 が不可能なら、ジャンプ先の全文表示だけ Shiki を直接使って自作する

## Alternatives

- Monaco：重く、worker の設定と複数ファイルのモデル管理が煩雑なので不採用
- CodeMirror 6 と `@codemirror/merge`：UI の組み立て量が多いので不採用

## 実装時の確認結果（2026-10-06）

- **スパイク C は成功**。
  - 変更されていないファイルは `File` コンポーネントで全文表示できる。
  - `onTokenClick` / `onTokenEnter` が返す `lineNumber`（1 始まり）と `lineCharStart`（JS 文字列のインデックス、UTF-16）を、そのまま LSP の Position に使える。
  - メモは `lineAnnotations` で表示し、追加は gutter utility（`enableGutterUtility`）で行う。
- 行へのスクロールは、open な shadow DOM（`diffs-container`）内の `[data-line]` を探して、縦方向だけ手動で動かす。`scrollIntoView` を使うとコード列まで横にスクロールしてしまうため。
- ハンク移動は `[data-line-type="change-addition" | "change-deletion"]` を辿る。
