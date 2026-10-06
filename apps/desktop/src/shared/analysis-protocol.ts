import type {
  ChangedFile,
  DiffedEdge,
  GraphEdge,
  GraphSnapshot,
  ReviewOrderItem,
  TestLink,
} from '@tsugi/core';

/** main → analysis のリクエスト */
export type AnalysisRequest =
  | { method: 'workspace.open'; params: { workspace: string; watch: boolean; testGlobs: string[] } }
  | { method: 'workspace.close'; params: { workspace: string } }
  | { method: 'workspace.status'; params: { workspace: string } }
  | {
      method: 'graph.neighborhood';
      params: {
        workspace: string;
        seeds: string[];
        hops: number;
        includeExternal: boolean;
        includeTypeOnly: boolean;
      };
    }
  | { method: 'graph.relations'; params: { workspace: string; path: string } }
  | {
      method: 'graph.diff';
      params: { workspace: string; repoPath: string; baseRev: string; files: ChangedFile[] };
    }
  | { method: 'reviewOrder'; params: { workspace: string; files: ChangedFile[] } }
  | { method: 'testLinks'; params: { workspace: string; paths?: string[] } }
  | { method: 'files.list'; params: { workspace: string } };

export type AnalysisResponseMap = {
  'workspace.open': { ready: boolean };
  'workspace.close': null;
  'workspace.status': { ready: boolean; files: number };
  'graph.neighborhood': GraphSnapshot & { ready: boolean };
  'graph.relations': { imports: GraphEdge[]; importedBy: GraphEdge[]; ready: boolean };
  'graph.diff': { edges: DiffedEdge[]; ready: boolean };
  reviewOrder: { items: ReviewOrderItem[]; ready: boolean };
  testLinks: { links: TestLink[]; ready: boolean };
  'files.list': { files: string[]; ready: boolean };
};

export type AnalysisMethod = AnalysisRequest['method'];

export type AnalysisMessage =
  | { kind: 'request'; id: number; request: AnalysisRequest }
  | { kind: 'response'; id: number; ok: true; result: unknown }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'event'; event: AnalysisEvent }
  | { kind: 'init'; gitPath: string };

export type AnalysisEvent =
  | { type: 'progress'; workspace: string; phase: 'graph' | 'testLinks'; done: number; total: number }
  | { type: 'ready'; workspace: string }
  | { type: 'fs.changed'; workspace: string; changed: string[]; removed: string[]; gitChanged: boolean }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };
