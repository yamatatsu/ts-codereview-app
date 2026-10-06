# 0013. GitHub 認証はプロジェクトごとの PAT のみ

- Status: Accepted
- Date: 2026-10-05

## Context

一般的な方法は環境変数（`GH_TOKEN` / `GITHUB_TOKEN`）か `gh auth token` を流用することです。しかし Shai-Hulud のようなサプライチェーンワームは、環境変数や gh の認証情報を窃取します。トークンの露出範囲は最小限にしたいと考えています。

## Decision

- **トークンの入手元は、アプリ設定で入力された PAT だけ**にする
  - 環境変数と `gh auth token` は一切読まない
- **プロジェクトごと**に PAT を設定する
  - 推奨は fine-grained PAT で、対象リポジトリを限定する
  - 必要な権限：`Contents: read`、`Pull requests: read`、`Metadata: read`
- 保存は Electron の `safeStorage.encryptString` で暗号化し、DB にはバイナリとして保存する
  - 平文はメモリ上の短時間しか持たない
- 保存時に `GET /repos/{owner}/{repo}` で疎通と権限を確認する
- git の fetch では、`git -c http.extraHeader="Authorization: Basic <base64(x-access-token:PAT)>" fetch ...` の形で**そのコマンドの間だけ**渡す
  - remote URL、`.git/config`、credential helper には保存しない
  - ログ出力ではヘッダーをマスクする
- GitHub API は Octokit（`@octokit/rest`）を使う

## Consequences

- PR を使うには、プロジェクトごとに PAT を作る手間がかかる（設定画面に作成手順と必要権限を明記する）
- 未署名アプリでの `safeStorage` の挙動を Phase 1 で確認する
  - 使えない場合（`isEncryptionAvailable() === false`）は、PR 機能を無効にしてその理由を表示する。平文保存へのフォールバックはしない
- `gh` CLI がなくても動く

## 実装時の確認結果（2026-10-06）

- 署名していない開発ビルドとパッケージ版の `.app` の両方で、`safeStorage.isEncryptionAvailable()` が true で、PAT の保存と読み出しができた（E2E で確認）。
- git fetch には `http.https://github.com/.extraheader` を `-c` で一時的に渡し、ログでは `maskSecrets` で伏せる。
