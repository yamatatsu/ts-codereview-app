# 0011. import グラフは oxc-parser と oxc-resolver で作る

- Status: Accepted
- Date: 2026-10-05

## Context

依存ビュー、テストの対応付け、レビュー順の算出には、Workspace 全体のモジュール依存グラフが必要です。LSP はグラフ全体を返す用途に向いていません。

## Decision

- **oxc-parser** で各ファイルを parse し、次の情報を抽出する
  - static import / export、dynamic import、`export * from`、`import type`（区別して保持する）
- **oxc-resolver** で import の指定子を実ファイルに解決する
  - tsconfig の `paths` と project references、`package.json` の `exports`、workspace パッケージに対応する
- グラフは analysis の utility process 上で構築し、メモリに保持する
  - ファイル監視の変更通知で、変更されたファイルだけを差分で更新する
- **base と head の 2 つのグラフ**を作る
  - head：Workspace のファイルを直接読む
  - base：変更ファイルとその 1 ホップ先だけを `git show <base>:<path>` で読む（部分グラフ）
  - これにより「この変更で増えた依存と消えた依存」を出す
- 外部パッケージ（node_modules）はノードとして集約し、中には辿らない

## Consequences

- 数千ファイルのリポジトリでも、秒単位で構築できる見込み（Phase 4 で計測する）
- 型レベルの参照（import を経由しない参照）はグラフに現れない。これは LSP の references で補う

## Alternatives

- dependency-cruiser：高機能だが、整形と性能面で不利なので不採用
- madge：2024 年からメンテナンスが止まっているので不採用

## 実装時の確認結果（2026-10-06）

- 合成した 2,000 ファイルの Workspace で、初回構築は約 170ms（M 系の Mac）。要件の 5 秒を大きく下回った（`graph/graph.perf.test.ts`）。
- 実リポジトリ `microsoft/vscode`（14,394 ファイル、エッジ 147,388 本）では、初回構築が 3.5 秒だった。
- oxc-resolver は実パスを返すので、Workspace のパスにシンボリックリンクが含まれる場合（macOS の `/var` → `/private/var` など）は、実パスのルートとも比較する。
