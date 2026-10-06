# Phase 5：テストと実装の分離・往来

## ゴール

実装とテストを分けて読み、ワンキーで行き来できる状態にする。

## タスク

### core

- [x] `testCandidates(testPath)`：命名規約から実装の候補パスを生成する（[specs/05](../specs/05-test-mapping.md)）
- [x] `computeTestLinks(graph, files, globs)`：primary と indirect を算出し、ヘルパーを除外する
- [x] `testOutline(source)`：oxc の AST から `describe` / `it` / `test`（`.each`、`.skip`、`.only`）のツリーを作る。変更行との交差判定も行う
- [x] テスト：コロケーション、`__tests__`、`tests/` のミラー構成、`index.ts`、indirect の除外ルール

### analysis と API

- [x] TestLink をグラフと一緒に算出し、差分更新する
- [x] `/targets/:key/test-links`、`/targets/:key/test-outline/:path`

### renderer

- [x] ファイル一覧を「実装」と「テスト」のグループに分ける。テストの数のバッジを付ける
- [x] Context panel の Tests（変更されていないテストも開ける）
- [x] `Alt+O` で切り替える（複数あればピッカー）
- [x] テストのアウトライン（`Cmd+Shift+O`）と変更マーク
- [x] ReviewOrder でテストを対応する実装の直後に挿入する

## 完了条件

- [specs/05](../specs/05-test-mapping.md) の受け入れ条件をすべて満たす
