# 0018. renderer のライブラリ構成

- Status: Accepted
- Date: 2026-10-05

## Decision

| 用途             | ライブラリ                                                               |
| ---------------- | ------------------------------------------------------------------------ |
| UI               | React 19                                                                 |
| スタイル         | Tailwind CSS v4（`@tailwindcss/vite`）                                   |
| コンポーネント   | shadcn/ui（`shadcn` CLI、new-york スタイル、`sonner`、`tw-animate-css`） |
| データ取得       | TanStack Query と Hono RPC（`hc<AppType>`）                              |
| ルーティング     | TanStack Router（hash history）                                          |
| UI 状態          | Zustand（選択中のファイル、ペインの状態、ジャンプ履歴）                  |
| グラフ描画       | @xyflow/react（React Flow）と elkjs（自動レイアウト。Web Worker で実行） |
| diff とコード    | @pierre/diffs（[0017](./0017-diff-viewer-pierre-diffs.md)）              |
| コマンドパレット | shadcn の `Command`（cmdk）                                              |
| ショートカット   | 自作の小さなキーマップ層（[specs/09](../specs/09-keybindings.md)）       |

- ルートの構成：`/projects/:projectId/targets/:targetId/files/*path`（hash）
  - ReviewTarget の識別子は `local-worktree`、`local-branch:<branch>`、`pr:<number>`
- SSE は `EventSource('app://api/events')` で受け取り、TanStack Query の `invalidateQueries` に変換する

## Consequences

- 画面の階層（プロジェクト → ReviewTarget → ファイル）を URL で表現できるので、戻る・進むと状態の復元が自然に動く
