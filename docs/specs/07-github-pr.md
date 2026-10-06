# 07. GitHub PR レビュー

## 前提

- Project に `githubRemote` と PAT が設定されていること（[01](./01-projects-and-settings.md)）

## PR 一覧

- `GET /repos/{owner}/{repo}/pulls?state=open`（Octokit）で取得する
  - 表示項目：番号、タイトル、作成者、head と base のブランチ、更新日時、draft かどうか
- 番号を直接入力して開くこともできる（closed の PR も可）
- 一覧はキャッシュし、手動で再取得する。ポーリングはしない

## PR を開く流れ

1. `pulls.get` で base の ref、head の SHA、状態を取得する
2. fetch する：`git fetch <remote> pull/<n>/head:refs/tsugi/pr-<n>` と `<base ref>`
   - PAT は `http.extraHeader` で一時的に渡す（[ADR 0013](../adr/0013-github-auth-per-project-pat.md)）
3. worktree を作成または更新する（[ADR 0014](../adr/0014-pr-worktree-and-dependency-install.md)）
4. 依存を install する（オフライン、`--ignore-scripts`）
   - 進捗は SSE `worktree.install.log` で流す
   - 失敗したら symlink にフォールバックし、警告バナーを出す
5. ReviewTarget を `merge-base(base, head)..head` で解決し、LSP とグラフの構築を始める

- 2 回目以降は worktree を再利用する
- PR の head SHA が変わっていれば、「新しいコミットがあります」と表示し、ワンクリックで更新できるようにする

## 表示する PR 情報

- タイトル、本文（Markdown を表示）、ラベル、レビュアー、CI の状態（`check-runs` の要約）
- 既存のレビューコメントは表示しない（[ADR 0002](../adr/0002-product-scope.md)、将来対応）

## 後始末

- アプリの起動時と PR 一覧の取得時に、管理下の PR の状態を確認する
  - merged / closed なら worktree と `refs/tsugi/pr-<n>` を削除する。DB のレビュー状態は残す
- 最後に開いてから `worktree.staleDays` 日経ったものは、削除の候補としてトーストで通知する
- 設定画面に worktree の一覧（サイズと最終利用日時）と削除ボタンを置く

## 受け入れ条件

- fork からの PR を開いて、定義ジャンプができる
- PAT が未設定・失効・権限不足のとき、それぞれ区別されたエラーメッセージが出る
- install 中も diff 表示はできる（LSP は install 完了後に起動する）
