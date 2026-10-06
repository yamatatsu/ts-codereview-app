# 0007. プロセス構成：main / analysis utility / 子プロセス / renderer

- Status: Accepted
- Date: 2026-10-05

## Context

import グラフの構築やファイル監視は CPU と I/O を多く使います。これを main で動かすと、IPC やウィンドウ操作が固まります。TS の LSP サーバーは独立したバイナリです。

## Decision

```
┌────────────── renderer (React, sandbox, contextIsolation) ──────────────┐
│  hc<AppType>('app://api/')  /  EventSource('app://api/events')           │
└───────────────▲─────────────────────────────────────────────────────────┘
                │ protocol.handle('app')  ※ポートは開けない
┌───────────────┴──────────── main ───────────────────────────────────────┐
│ Hono app / GitClient / GitHubClient(Octokit) / DB(node:sqlite+Drizzle)   │
│ Settings(JSON) / safeStorage / LspManager / ウィンドウ管理               │
└──────┬──────────────────────────────┬───────────────────────────────────┘
       │ MessagePort                  │ stdio (JSON-RPC)
┌──────▼───── analysis utility ─────┐ ┌──────▼────── 子プロセス ─────────────┐
│ ImportGraph (oxc), TestLink,      │ │ tsc --lsp (Workspace ごとに 1 つ)    │
│ @parcel/watcher                    │ │ git / pnpm install                   │
└────────────────────────────────────┘ └──────────────────────────────────────┘
```

- **main**
  - Hono（内部 API）、git と GitHub へのアクセス、DB、設定、トークンの暗号化
  - LSP サーバーの起動と停止（LspManager）
  - 子プロセスの起動は必ず `core` の `spawnSafe` を通す（[0016](./0016-supply-chain-and-subprocess-hardening.md)）
- **analysis（`utilityProcess.fork`）**
  - ImportGraph の構築と差分更新、TestLink の算出、ファイル監視
  - main とは MessagePort で通信し、型付きのリクエスト／レスポンスとイベントをやり取りする
- **tsc --lsp**
  - Workspace（clone 本体または PR の worktree）ごとに 1 インスタンス
  - 一定時間（10 分）アクセスがなければ停止する
- **renderer**
  - preload は `contextBridge` で最小限の情報（プラットフォームなど）だけを公開する。データアクセスはすべて `app://api` 経由
  - Node 統合はオフ、`sandbox: true`

## Consequences

- 重い解析が UI とメインのイベントループを止めない
- main と analysis の間に型付きの通信層が要る。`core` に `defineChannel` のような薄いユーティリティを作る
