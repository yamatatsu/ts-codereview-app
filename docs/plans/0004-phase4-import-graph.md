# Phase 4：import グラフと依存ビュー

## ゴール

変更ファイルの依存関係を可視化し、「次に読むもの」（ReviewOrder）を提示できる状態にする。

## タスク

### core

- [x] `scanModule(source)`：oxc-parser で import / export / dynamic import / type-only / re-export を抽出する
- [x] `ModuleResolver`：oxc-resolver に tsconfig（paths、references）と workspace パッケージを設定する
- [x] `ImportGraph`：構築、差分更新（ファイル単位）、近傍の取得（hops、方向）、外部パッケージの集約
- [x] `buildBaseSubgraph`：変更ファイルとその 1 ホップ先を `showBlob` で読み、base 側の部分グラフを作る
- [x] `diffGraphs`：エッジの added / removed を求める
- [x] `reviewOrder`：誘導部分グラフに対する SCC（Tarjan）とトポロジカルソート（葉から）
- [x] テスト：循環、re-export、paths エイリアス、`import type`、性能計測（2,000 ファイルの合成 fixture で 5 秒以内）

### analysis

- [x] ReviewTarget を解決したらグラフを構築し、`analysis.progress` を送る。watcher の通知で差分更新する
- [x] main とのチャネル：`graph.query`、`reviewOrder.get`

### renderer

- [x] 依存グラフの画面（`Cmd+Shift+G`）：React Flow と elkjs（Web Worker）、フィルター、ホップ数の切り替え、ダブルクリックで再展開
- [x] Context panel：Imports / Imported by
- [x] ファイル一覧を「レビュー順」でソートできるようにする（デフォルト）

## 完了条件

- [specs/06](../specs/06-dependency-graph.md) の受け入れ条件をすべて満たす
