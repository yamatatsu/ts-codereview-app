# 0010. コード解析は同梱した TS7 の `tsc --lsp` で行う

- Status: Accepted
- Date: 2026-10-05

## Context

Go to Definition、Find References、hover を VS Code と同じ精度で提供したいと考えています。2026-10 時点の選択肢は次のとおりです。

- TS7 の `tsc --lsp --stdio`：definition / references / hover に対応し、高速
- TS7 の `typescript/unstable/*` API：不安定で、機能も部分的
- TS6 の LanguageService（`@typescript/typescript6`）や ts-morph：成熟しているが遅く、今後は廃れる方向
- 対象リポジトリ自身の TypeScript を使う：バージョンは一致するが、起動経路が 2 系統になる

## Decision

- **TSugi に同梱した `typescript@7.x` の `tsc --lsp --stdio`** を使う
- LSP サーバーは Workspace ごとに 1 つ起動する。`rootUri` は Workspace のルートとし、monorepo と project references は tsc の解決に任せる
- クライアントは core に自作の薄い JSON-RPC クライアントを置く（`vscode-jsonrpc` と `vscode-languageserver-protocol` の型を使う）
- 使う LSP メソッド：`initialize`、`textDocument/didOpen`、`definition`、`typeDefinition`、`references`、`hover`、`documentSymbol`
- 読み取り専用なので、`didChange` は使わない。ファイル監視（analysis）で変更を検知したら `workspace/didChangeWatchedFiles` を送る
- 対象は head 側の Workspace だけ。base 側のジャンプは将来対応とする

## Consequences

- 大規模リポジトリでも速い
- **制約**：TS7 で削除・変更されたオプション（古い `moduleResolution` など）に依存するリポジトリでは、解析が不正確になる。TSugi はこれを非対応とし、UI で LSP の診断と警告を表示する
- 対象リポジトリの TS バージョンとの差は許容する

## Alternatives

- LSP の抽象化と、ワークスペースの TS へのフォールバック：検討したが、MVP の複雑さを避けて不採用

## Revisit when

- TS7 で削除されたオプションを使うリポジトリをレビューする必要が出たとき（`typescript-language-server` を使う経路の追加を検討）
- TS 7.1 で安定した API が提供されたとき

## 実装時の確認結果（2026-10-06）

- **スパイク D は成功**。`typescript@7.0.2` のネイティブ版 tsc（`typescript/lib/getExePath.js` で解決）を `--lsp --stdio` で起動し、monorepo（project references、workspace パッケージ、paths エイリアス）でパッケージをまたぐ definition / references / hover / documentSymbol が動くことを統合テストで確認した。
- ReviewTarget を開いた時点で LSP を先に起動する（ウォームアップ）。PR では依存の install が終わってから起動し直す。
- ネイティブ版 tsc は自身の隣にある `lib*.d.ts` を必要とする（パッケージングについては ADR 0004 を参照）。
