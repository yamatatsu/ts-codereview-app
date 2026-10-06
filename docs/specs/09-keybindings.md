# 09. キーボードショートカット

VS Code ユーザーが自然に使えることを最優先にします。MVP ではキーは固定ですが、内部はコマンド ID とキーの対応表で管理し、将来 `keybindings.json` で上書きできるようにします。

| コマンド ID                      | 操作                                                             | キー                      | 出典                            |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------- | ------------------------------- |
| `workbench.quickOpen`            | ファイルのクイックオープン（変更ファイル優先、全ファイルも検索） | `Cmd+P`                   | VS Code                         |
| `workbench.commandPalette`       | コマンドパレット                                                 | `Cmd+Shift+P`             | VS Code                         |
| `nav.goToDefinition`             | 定義へジャンプ                                                   | `F12` / `Cmd+Click`       | VS Code                         |
| `nav.findReferences`             | 参照を検索                                                       | `Shift+F12`               | VS Code                         |
| `nav.peekDefinition`             | 定義をピーク表示                                                 | `Alt+F12`                 | VS Code                         |
| `nav.back` / `nav.forward`       | 戻る / 進む                                                      | `Ctrl+-` / `Ctrl+Shift+-` | VS Code                         |
| `diff.nextChange` / `prevChange` | 次 / 前のハンク                                                  | `Alt+F5` / `Shift+Alt+F5` | VS Code                         |
| `files.next` / `files.prev`      | 次 / 前の変更ファイル（レビュー順）                              | `Cmd+Alt+→` / `Cmd+Alt+←` | VS Code のタブ移動              |
| `files.nextUnviewed`             | 次の未 Viewed ファイル                                           | `Cmd+Alt+↓`               | 独自                            |
| `outline.show`                   | シンボルとテストのアウトライン                                   | `Cmd+Shift+O`             | VS Code                         |
| `test.toggle`                    | 実装 ↔ テストの切り替え                                          | `Alt+O`                   | C/C++ 拡張                      |
| `review.toggleViewed`            | Viewed の切り替え                                                | `Cmd+Alt+V`               | 独自                            |
| `view.toggleSidebar`             | ファイル一覧の表示切り替え                                       | `Cmd+B`                   | VS Code                         |
| `view.togglePanel`               | Context panel の表示切り替え                                     | `Cmd+Alt+B`               | VS Code（セカンダリサイドバー） |
| `graph.open`                     | 依存グラフを開く                                                 | `Cmd+Shift+G`             | 独自                            |
| `diff.toggleLayout`              | split と unified の切り替え                                      | `Cmd+Alt+L`               | 独自                            |
| `note.add`                       | 現在行にメモを追加                                               | `Cmd+Alt+M`               | 独自                            |
| `editor.openExternal`            | 外部エディタで開く                                               | `Cmd+Shift+E`             | 独自                            |
| `search.find`                    | ファイル内の検索                                                 | `Cmd+F`                   | VS Code                         |

- すべてのコマンドはコマンドパレットに表示し、割り当てたキーも併記する
- テキスト入力中（メモの編集など）は、修飾キーなしのショートカットを無効にする
- macOS の Option キーでの文字入力と衝突しないよう、`Alt` 系は `event.code` で判定する
