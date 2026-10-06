# 0016. サプライチェーン対策と子プロセスの隔離

- Status: Accepted
- Date: 2026-10-05

## Context

Shai-Hulud のような npm ワームは、install スクリプトから環境変数、トークン、gh の認証情報を窃取して自己増殖します。TSugi はレビューの過程で他人のコードを扱い、外部コマンドを起動します。

## Decision

### TSugi 自身の依存

- `pnpm-workspace.yaml` に次を設定する
  - `minimumReleaseAge: 1440`：公開から 24 時間未満のバージョンは入れない
  - ビルドスクリプトを許可するパッケージを明示する（`onlyBuiltDependencies` か、使用する pnpm バージョンでの後継設定。Phase 0 で確認する）
    - 許可候補：`electron`、`@parcel/watcher`、（必要なら）`better-sqlite3`
  - `strictDepBuilds: true`：許可していないパッケージのビルドスクリプトがあればエラーにする
- lockfile は必ずコミットし、CI は `--frozen-lockfile` を使う
- 新しい依存の追加は PR のレビュー対象にし、影響が大きいものは ADR に残す

### レビュー対象リポジトリ

- install は必ず `--ignore-scripts` かつオフラインで行う（[0014](./0014-pr-worktree-and-dependency-install.md)）
- 対象リポジトリのコード、スクリプト、テストは実行しない

### 子プロセスの起動

- `core` の `spawnSafe` を唯一の入口にする
  - 実行ファイルは**アプリ設定で明示した絶対パス**のみを許可する
  - 初期値は固定の候補リストから自動検出する：`/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`、`~/.local/share/vite-plus/bin`、`~/.vite-plus/bin`（Vite+ の shim）
  - ログインシェルの実行（`zsh -ilc`）による PATH の取り込みはしない
- 子プロセスに渡す環境変数は**許可リスト方式**にする
  - 許可：`PATH`（設定から組み立てたもの）、`HOME`、`LANG`、`LC_ALL`、`TMPDIR`、`GIT_TERMINAL_PROMPT=0`
  - `process.env` はそのまま渡さない
- `shell: true` は禁止し、引数は配列で渡す。oxlint の `no-restricted-syntax` などで検出する

### Electron

- renderer は `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`
- CSP を設定し、`script-src 'self'` にする
- `app://` 以外へのナビゲーションと `window.open` は拒否する。外部リンクは `shell.openExternal` に、許可した https の URL だけを渡す

## Consequences

- 新しい依存を入れるまでに最低 24 時間かかる
- 候補にない場所（バージョンマネージャーの shim など）の実行ファイルを使うには、ユーザーが設定で絶対パスを指定する必要がある

## 実装時の確認結果（2026-10-06）

- pnpm 12 では、ビルドスクリプトの許可リストの設定名は `allowBuilds`（`onlyBuiltDependencies` は旧名）。`strictDepBuilds` は既定で true、`minimumReleaseAge` は既定で 1440 分。
- 許可したもの：`electron`、`@parcel/watcher`
- 明示的に拒否したもの：`esbuild`、`electron-winstaller`（Windows 用）、`sqlite3`（byethrow-docs の検索用で、skill には不要）
- `saveExact: true` にし、すべての依存を厳密なバージョンで記録した。
- `child_process` の直接 import は oxlint の `no-restricted-imports` で禁止し、`spawnSafe` だけを例外にしている。
