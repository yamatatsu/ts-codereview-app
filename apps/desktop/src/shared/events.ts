import type { LspStatus } from '@tsugi/core';

/** main → renderer の SSE イベント（docs/specs/10） */
export type ServerEvent =
  | { type: 'workspace.changed'; targetKey: string }
  | {
      type: 'analysis.progress';
      workspace: string;
      phase: 'graph' | 'testLinks';
      done: number;
      total: number;
    }
  | { type: 'analysis.ready'; workspace: string }
  | { type: 'lsp.status'; workspace: string; status: LspStatus; message?: string }
  | { type: 'worktree.install.log'; targetKey: string; line: string }
  | { type: 'worktree.install.done'; targetKey: string; result: 'ok' | 'fallback' | 'failed' }
  | { type: 'pr.headChanged'; targetKey: string; newHeadSha: string }
  | { type: 'worktree.stale'; worktreeId: string; projectId: string; prNumber: number; days: number };
