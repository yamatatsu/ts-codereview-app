# Phase 6：GitHub PR

## ゴール

PAT を設定した Project で、PR を worktree に展開し、ローカル差分と同じ体験でレビューできる状態にする。

## タスク

### core

- [x] `GitHubClient`（Octokit）：`getRepo`、`listPulls`、`getPull`、`getCheckRunsSummary`。エラーは `GitHubError` に変換する
- [x] `GitClient` の拡張：`fetchPullHead`（`http.extraHeader` による一時的な認証、ログのマスク）、`worktreeAdd` / `Remove` / `List`、`checkoutDetach`
- [x] `detectPackageManager(lockfiles)` と `installDependencies`（オフライン、`--ignore-scripts`、ログのストリーミング）、`symlinkNodeModulesFallback`
- [x] `resolveTarget` を `pr` に対応させる
- [x] テスト：ローカルの bare リポジトリを remote に見立て、`refs/pull/*/head` を手動で作って fetch と worktree を検証する

### main と API

- [x] PAT の保存時に疎通を確認する（`getRepo`）
- [x] `/projects/:id/pulls`、PR の resolve（worktree の準備は非同期にし、SSE で進捗を流す）
- [x] PR の head の変化を検知して `pr.headChanged` を送り、更新処理を行う
- [x] 後始末：起動時と一覧取得時に merged / closed を削除し、古いものを通知する。`/worktrees` API

### renderer

- [x] PR 一覧と番号入力、PR 情報の表示（本文、ラベル、CI の要約）
- [x] install の進捗とフォールバック時の警告バナー
- [x] PAT の設定 UI の仕上げ（必要な権限の説明とエラーの出し分け）
- [x] 設定画面の worktree 管理

## 完了条件

- [specs/07](../specs/07-github-pr.md) の受け入れ条件をすべて満たす
- 自分の実リポジトリの PR（fork からのものを含む）で、ジャンプ、グラフ、テストの往来が動く
