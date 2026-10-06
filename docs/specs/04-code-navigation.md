# 04. コードナビゲーション

## 提供する機能

| 機能             | LSP メソッド                  | UI                                                                         |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------- |
| 定義へジャンプ   | `textDocument/definition`     | 候補が 1 つなら即移動、複数ならピッカー                                    |
| 型定義へジャンプ | `textDocument/typeDefinition` | コマンドパレットから                                                       |
| 参照を検索       | `textDocument/references`     | Context panel の References に一覧表示する。変更ファイル内の参照は強調する |
| 定義のピーク表示 | `definition`                  | diff の下にインラインで小さな Code view を出す                             |
| hover            | `textDocument/hover`          | ポップオーバー                                                             |
| アウトライン     | `textDocument/documentSymbol` | Context panel の Outline                                                   |

## 対象と制約

- head 側（右ペインと unified の追加行・文脈行）のトークンだけがジャンプ可能
  - base 側（削除行）のトークンはジャンプできず、カーソルで区別して示す
- 対象は Workspace 内のファイルと、`node_modules` 内の `.d.ts`
  - `node_modules` のファイルは読み取り専用の Code view で表示し、ファイル一覧には出さない
- 削除されたファイル（status `D`）では、ジャンプは無効

## ジャンプ履歴

- VS Code の Go Back / Go Forward と同じモデル：位置（ファイル、行、列、ビュー種別）のスタック
- ジャンプ、ファイル選択、テスト ↔ 実装の切り替えで push する
- `Ctrl+-` で戻り、`Ctrl+Shift+-` で進む
- ReviewTarget ごとに独立させ、メモリにだけ保持する

## LSP のライフサイクル

- ReviewTarget を開いたときに、その Workspace の `tsc --lsp` を起動する（すでに起動済みなら再利用する）
- 状態（`starting` / `indexing` / `ready` / `error`）は SSE `lsp.status` で送り、ステータスバーに表示する
- `ready` になるまでジャンプの要求はキューに入れる（タイムアウトは 30 秒）
- 10 分アクセスがなければ停止する。異常終了したら、最大 3 回まで自動で再起動する
- ファイルを開くたびに `didOpen` する。開いたファイルは LRU 方式で最大 50 件まで保持する
- ファイル監視の通知は `workspace/didChangeWatchedFiles` に変換して送る

## 受け入れ条件

- fixture の monorepo（project references と workspace パッケージを含む）で、パッケージをまたぐ定義ジャンプが成功する
- `tsconfig` の `paths` エイリアス経由の import から、定義ジャンプが成功する
