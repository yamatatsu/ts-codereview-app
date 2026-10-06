# TSugi

TypeScript のコードレビューで「読む効率」を上げる、macOS（Apple Silicon）向けのデスクトップアプリです。

- **ローカル差分と GitHub PR** を同じ画面でレビューできます。PR は TSugi 管理の git worktree に展開し、作業中の clone は汚しません
- **型を考慮したコードジャンプ**：同梱した TypeScript 7 の `tsc --lsp` で、定義・参照・hover を表示します
- **テストと実装を分けて読み、`⌥O` で行き来**できます。命名規約と import から対応を判定します
- **依存グラフ**で変更の影響範囲を見られます。「次に読むもの」（依存の葉から読むレビュー順）も提示します
- **Viewed とメモ**でレビューの進捗を管理できます。追加 push の後は差分の差分だけを再レビューできます
- ショートカットは **VS Code 準拠**です（`F12`、`⇧F12`、`⌃-`、`⌘P`、`⌘⇧P` など）

設計の詳細は [`docs/`](./docs/README.md) を参照してください（ADR / specs / 実装計画）。

## セットアップ

[Vite+](https://viteplus.dev/) のグローバル CLI（`vp`）を入れておきます。Node 24.21.0 と pnpm 12.9.1 は、`package.json` の `engines.node` と `packageManager` から `vp` が選びます。

```bash
vp install            # サプライチェーン対策の設定は pnpm-workspace.yaml（docs/adr/0016）
```

## 開発

```bash
vp check                         # format・lint・型チェック（oxfmt / oxlint / TS7）
vp -C packages/core test         # core のユニットテストと統合テスト
vp -C apps/desktop test          # renderer のロジックのテスト
vp -C apps/desktop run dev       # 開発起動（Vite の dev server + tsdown の watch + Electron）
vp -C apps/desktop run e2e       # Electron の E2E（Playwright。ローカルでのみ実行）
TSUGI_E2E_GITHUB=1 vp -C apps/desktop run e2e  # 本物の GitHub の PR も読む（GH_TOKEN に PAT が必要）
```

## ビルドとインストール

```bash
vp -C apps/desktop run package   # apps/desktop/release/mac-arm64/TSugi.app
```

自分専用なので署名していません。ほかの場所からコピーした `.app` を開けない場合は、quarantine 属性を外してください。

```bash
xattr -dr com.apple.quarantine /Applications/TSugi.app
```

## 初回の設定

1. 起動すると、`git` / `pnpm` / `code` などの実行ファイルを決まった場所から自動で検出します。ログインシェルは実行しません。見つからない場合は「設定」で絶対パスを指定してください。
2. 「プロジェクト」→「リポジトリを追加」で、clone 済みのディレクトリを登録します。
3. PR をレビューする場合は、プロジェクト設定で**そのリポジトリ専用の fine-grained PAT**を登録します（Contents / Pull requests / Metadata の read-only）。PAT は Keychain で暗号化して保存され、環境変数や `gh` の認証情報は使いません。

## ディレクトリ構成

```
apps/desktop      Electron アプリ（main / preload / analysis utility / renderer）
packages/core     Electron 非依存のロジック（git、ReviewTarget、LSP クライアント、import グラフ、テスト対応、DB）
docs/             ADR・仕様・実装計画
```
