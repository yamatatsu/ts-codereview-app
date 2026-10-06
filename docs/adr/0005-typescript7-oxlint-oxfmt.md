# 0005. TypeScript 7 と oxlint（type-aware）・oxfmt

- Status: Accepted
- Date: 2026-10-05

## Context

- TypeScript 7.0（Go ネイティブ版）は 2026-07-08 に stable になった。ただし JS API は未提供
- oxlint の type-aware lint は 2026-07-22 に stable になった。tsgolint v7 を使い、**TypeScript 7 が必須**
- oxfmt は 0.7x の beta。Prettier の JS/TS 互換テストには 100% 通っており、import ソートと Tailwind のクラスソートも内蔵している
- どちらも Vite+ に同梱されていて、`vp check` から実行される

## Decision

- TSugi 自身のコードは **TypeScript 7** で typecheck する
- oxlint の `typeAware: true` と `typeCheck: true` を有効にする
  - 設定は `vite.config.ts`（Vite+ の統合設定）か `oxlint.config.ts` に置く
  - `@praha/byethrow-oxlint` のプリセットを有効にする
- フォーマッターは **oxfmt**（beta のまま採用）。Tailwind のクラスソートと import ソートを有効にする
- `tsconfig` は `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`moduleResolution: bundler` を基本にする

## Consequences

- typecheck と lint が速い
- TS の JS API（`ts.createProgram` など）を TSugi のコードから直接使うことはできない。解析には LSP を使う（[0010](./0010-ts-analysis-with-bundled-tsc-lsp.md)）

## Revisit when

- oxfmt に破壊的な変更が入って差分が荒れたとき
- TS 7.1 で JS API が提供されたとき（[0010](./0010-ts-analysis-with-bundled-tsc-lsp.md) と合わせて見直す）

## 実装時の確認結果（2026-10-06）

- 設定はルートの `vite.config.ts` の `lint` / `fmt` ブロックに集約した（Vite+ では nested config が無効なため、パッケージごとの差分は `overrides` で書く）。
- `@praha/byethrow-oxlint` の recommended を `extends` で有効化した。自動修正でテストのアサーションが `toBeSuccess()` などの matcher に書き換わるので、`@praha/byethrow-testing` の matcher を `packages/core/src/testing/setup.ts` で登録している。vitest 5 の `Matchers<R, T>` は型引数が 2 つになったので、拡張側もそれに合わせた。
