# Phase 2：ローカル差分レビュー

## ゴール

自分のローカル変更を、TSugi で diff として読める状態にする（ジャンプはまだ）。

## タスク

### core

- [x] `GitClient` の拡張：`mergeBase`、`diffNameStatus`（`-M -z`）、`lsFilesOthers`、`showBlob`、`hashObject`、`checkAttr`（linguist-generated）
- [x] `resolveTarget(target)`：`local-worktree` と `local-branch` → `ResolvedTarget`（[specs/02](../specs/02-review-target.md)）
- [x] `classifyFile`：collapsed / other / test / impl を glob と属性で判定する
- [x] テスト：rename、追跡されていないファイル、削除、バイナリ、merge-base

### analysis

- [x] @parcel/watcher で clone 本体を監視する（`.gitignore` と `.git` 内の不要な部分を除外し、HEAD と refs は監視する）
- [x] debounce をかけて main に `workspace.changed` を通知する

### main と API

- [x] `/projects/:id/targets/resolve`、`/targets/:key/files/:path/blobs`、`/projects/:id/branches`
- [x] watcher の通知 → ReviewTarget の再解決 → SSE

### renderer

- [x] ヘッダーの ReviewTarget セレクタ（local-worktree / local-branch）
- [x] ファイル一覧（パス順。グループ分けは Phase 5）、status アイコン、collapsed の折りたたみ
- [x] @pierre/diffs による diff 表示、split と unified の切り替え、ハンク移動（`Alt+F5`）、ファイル移動（`Cmd+Alt+←/→`）
- [x] `Cmd+P` のクイックオープン（変更ファイルのみ）
- [x] 「VS Code で開く」

## 完了条件

- 作業ツリーでファイルを保存すると、1 秒以内に一覧と diff が更新される
- ブランチと main の差分（merge-base）を表示できる
