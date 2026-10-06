# 0012. git 操作はシステムの git CLI を使う

- Status: Accepted
- Date: 2026-10-05

## Decision

- システムの `git` を子プロセスで呼び出す。パスはアプリ設定で明示する（[0016](./0016-supply-chain-and-subprocess-hardening.md)）
- core に `GitClient` を置く。すべての操作は `ResultAsync` を返す
  - `revParse`、`mergeBase`、`diffNameStatus`（`git diff --name-status -M -z`）、`showBlob`（`git show <rev>:<path>`）、`hashObject`
  - `fetchPullHead`（`git fetch <remote> pull/<n>/head:refs/tsugi/pr-<n>`）
  - `worktreeAdd` / `worktreeRemove` / `worktreeList`
- 出力は `-z`（NUL 区切り）や porcelain 形式でパースする
- 1 ファイル内の行単位の diff は git に任せず、base と head の blob を diff ビューアに渡して計算させる（[0017](./0017-diff-viewer-pierre-diffs.md)）
- 環境変数は `GIT_TERMINAL_PROMPT=0` と `GIT_OPTIONAL_LOCKS=0` を固定で指定する

## Consequences

- 手元の git と同じ挙動になる（`.gitattributes` や rename 検出も同じ）
- git が見つからなければ何もできないので、初回起動時にパスを検証する

## Alternatives

- isomorphic-git：worktree に対応しておらず、大規模リポジトリで遅いので不採用
- simple-git：型が緩く、薄いラッパーなら自作で十分なので不採用
