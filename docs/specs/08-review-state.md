# 08. レビュー状態（Viewed とメモ）

## Viewed

- 「ファイルを見た」という記録は、**ReviewTarget の種類とファイルパスと head の blob SHA** に紐づける
  - 同じ内容を見たかどうかを、blob で判定する
- 状態
  - `viewed`：記録された blob と、現在の head の blob が一致する
  - `changed-since-viewed`：記録はあるが blob が異なる（追加 push や再編集があった）
  - `unviewed`：記録がない
- `changed-since-viewed` のファイルは、「前回見た blob → 現在の blob」の diff（**差分の差分**）を表示できる
  - 通常の base..head の表示とトグルで切り替える
  - 前回見た blob は `git cat-file` で取得する。PR では ref が残っているので取得できる
- ファイル一覧とヘッダーに進捗を表示する（`viewed 5/13`）。`collapsed` は母数に含めない

## Note（行メモ）

- 自分用のプライベートなメモ。GitHub には送らない
- 次の情報に紐づける：Project、ReviewTarget のキー、ファイルパス、head の blob SHA、行範囲、本文（Markdown）
- blob が変わったら、行番号の追従（diff による行マッピング）を試みる。追従できなければ「古いメモ」として表示する
- Context panel に、ReviewTarget 内のメモの一覧を表示する。「Markdown としてコピー」ボタンを付けて、手動で GitHub に貼れるようにする

## DB スキーマ（Drizzle、概要）

```
projects(id, name, root_path, default_base_branch, github_remote, encrypted_pat BLOB,
         collapsed_globs JSON, test_globs JSON, last_opened_at, created_at)
review_targets(id, project_id, kind, key, base_rev, head_rev, last_opened_at)   -- key = 'pr:123' など
pr_worktrees(id, project_id, pr_number, path, head_sha, install_status, last_opened_at)
viewed(id, project_id, target_key, path, blob_sha, viewed_at)                   -- UNIQUE(project_id,target_key,path)
notes(id, project_id, target_key, path, blob_sha, start_line, end_line, body, created_at, updated_at)
```

## 受け入れ条件

- PR に追加 push があった後、変更されたファイルだけが `changed-since-viewed` になる
- `changed-since-viewed` のファイルで差分の差分を表示できる
