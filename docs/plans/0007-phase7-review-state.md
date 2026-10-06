# Phase 7：レビュー状態

## ゴール

Viewed とメモで、レビューの進捗を管理できる状態にする。追加 push 後は差分だけを再レビューできるようにする。

## タスク

### core

- [x] `ViewedRepository`：設定、解除、ReviewTarget 単位での状態計算（viewed / changed-since-viewed / unviewed）
- [x] `NotesRepository`：CRUD、blob の変化に合わせた行の追従（行マッピング）と「古いメモ」の判定
- [x] 差分の差分：前回見た blob と現在の blob の取得

### renderer

- [x] Viewed のトグル（`Cmd+Alt+V`、一覧のチェックボックス）、進捗の表示、`Cmd+Alt+↓` で次の未 Viewed ファイルへ
- [x] `changed-since-viewed` のファイルで、通常の差分と差分の差分を切り替える
- [x] メモ：行の `+` か `Cmd+Alt+M` で追加、annotation で表示、Context panel に一覧、Markdown としてコピー
- [x] 依存グラフのノードに Viewed の状態を反映する

## 完了条件

- [specs/08](../specs/08-review-state.md) の受け入れ条件をすべて満たす
