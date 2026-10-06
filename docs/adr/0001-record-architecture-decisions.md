# 0001. ADR で設計判断を記録する

- Status: Accepted
- Date: 2026-10-05

## Context

TSugi は技術スタックが新しく、Vite+ 1.0、TypeScript 7、oxfmt beta などを使います。そのため「なぜそれを選んだか」と「何が起きたら見直すか」を残しておく必要があります。

## Decision

- `docs/adr/NNNN-<slug>.md` に MADR の簡略版で記録する。セクションは Context / Decision / Consequences / Alternatives / Revisit when
- 判断を覆すときは既存の ADR を書き換えない。新しい ADR を起こし、旧 ADR の Status を `Superseded by NNNN` にする
- 依存パッケージの追加・変更（[0016](./0016-supply-chain-and-subprocess-hardening.md)）も、影響が大きいものは ADR に残す

## Consequences

- 後から参加する人や AI エージェントが、判断の背景を辿れる
- ADR を書く手間が少し増える
