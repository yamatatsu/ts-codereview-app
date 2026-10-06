# 01. プロジェクトと設定

## Project

- 登録：ローカルのディレクトリを選択する
  - git リポジトリのルートであることを確認する（`git rev-parse --show-toplevel`）
- Project が持つ情報

| フィールド          | 説明                                                   |
| ------------------- | ------------------------------------------------------ |
| `id`                | UUID                                                   |
| `name`              | 表示名（デフォルトはディレクトリ名）                   |
| `rootPath`          | clone の絶対パス                                       |
| `defaultBaseBranch` | 例：`main`。`origin/HEAD` から自動で推定する           |
| `githubRemote`      | `owner/repo`。`origin` の URL から推定し、変更もできる |
| `encryptedPat`      | safeStorage で暗号化した PAT（任意）                   |
| `collapsedGlobs`    | 折りたたみ表示にする glob の追加分                     |
| `testGlobs`         | テストファイルと判定する glob（デフォルトを上書き）    |
| `lastOpenedAt`      | 最後に開いた日時                                       |

- 削除：Project を削除すると、TSugi が作った worktree、`refs/tsugi/*`、DB のレビュー状態も削除する。clone 本体には触れない

## PAT 設定

- 入力欄には、必要な権限（Contents: read、Pull requests: read、Metadata: read）と作成手順のリンクを表示する
- 保存時に `GET /repos/{owner}/{repo}` を呼び、成功したら保存する。失敗時は `GitHubError` の種類に応じたメッセージを出す
- 保存後は値を再表示しない（「設定済み」の表示と、「削除」「置き換え」の操作だけ）
- `safeStorage.isEncryptionAvailable()` が false なら、入力欄を無効にして理由を表示する

## アプリ設定（`settings.json`）

| キー                                | 内容                                 | デフォルト                                                                                               |
| ----------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `executables.git`                   | git の絶対パス                       | 自動検出                                                                                                 |
| `executables.pnpm` / `npm` / `yarn` | 絶対パス                             | 自動検出（Vite+ の shim を含む）                                                                         |
| `executables.node`                  | pnpm などを実行する node             | 自動検出                                                                                                 |
| `diff.layout`                       | `split` / `unified`                  | `split`                                                                                                  |
| `diff.defaultCollapsedGlobs`        | 折りたたみ表示の glob                | `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock`、`**/*.snap`、`**/dist/**`、`linguist-generated` 属性 |
| `tests.defaultGlobs`                | テストファイルの判定                 | `**/*.{test,spec}.{ts,tsx,mts,cts}`、`**/__tests__/**`                                                   |
| `externalEditor`                    | `code` / `cursor` / カスタムコマンド | `code`                                                                                                   |
| `theme`                             | `system` / `light` / `dark`          | `system`                                                                                                 |
| `worktree.staleDays`                | 削除候補として通知するまでの日数     | 14                                                                                                       |

### 実行ファイルの自動検出

- 候補ディレクトリを固定順に探す：`/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`、`~/.local/share/vite-plus/bin`、`~/.vite-plus/bin`
- 見つかったら `--version` を実行して検証し、設定画面に結果を表示する
- 初回起動時は、オンボーディングで検出結果を確認してもらう
- 見つからない場合は、ファイル選択で指定してもらう
- ログインシェルは実行しない（[ADR 0016](../adr/0016-supply-chain-and-subprocess-hardening.md)）
