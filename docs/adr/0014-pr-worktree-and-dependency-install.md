# 0014. PR は worktree に展開し、`--ignore-scripts` で依存を入れる

- Status: Accepted
- Date: 2026-10-05

## Context

PR のコードで型を考慮したジャンプをするには、head 側のファイルと `node_modules` が実在する必要があります。ユーザーの作業中の clone は汚したくありません。

## Decision

- 前提：レビュー対象のリポジトリは、ユーザーが既に clone して Project として登録済み
- PR を開くときの手順：
  1. `git fetch <remote> pull/<n>/head:refs/tsugi/pr-<n>` を実行する（fork からの PR にも対応）。base ブランチも fetch する
  2. `git worktree add --detach <appData>/worktrees/<projectId>/pr-<n> refs/tsugi/pr-<n>` を実行する
  3. lockfile から PM を判定し、オフラインかつスクリプトなしで依存を入れる
     - pnpm：`pnpm install --frozen-lockfile --offline --ignore-scripts`
     - npm：`npm ci --offline --ignore-scripts`
     - yarn：`yarn install --immutable --mode=skip-build`（オフライン可否は best effort）
  4. install に失敗したら、clone 本体の `node_modules` を symlink する（フォールバック）
     - このとき UI に「依存が head と異なる可能性があります」と警告を出す
- 追加 push があったら、fetch して `git checkout --detach <新しい head>` で worktree を更新する。lockfile に差分があれば再 install する
- 後始末：
  - PR が merged / closed なら、worktree と ref を自動で削除する
  - 最後に開いてから 14 日経った worktree は、削除の候補として通知する
  - 手動削除のボタンも用意する
- PR の worktree はファイル監視の対象にしない

## Consequences

- 他人の PR の install スクリプト（postinstall など）は実行されない
  - このため、ネイティブバイナリやコード生成に依存する型は解決できないことがある
- `--offline` を使うので、pnpm store にないパッケージがあると失敗する
  - その場合はフォールバックになる
  - オンライン install を許可する設定は将来の検討事項とする
