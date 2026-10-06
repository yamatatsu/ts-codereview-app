import { GitClient } from '@tsugi/core';

import type { AnalysisEvent, AnalysisMessage, AnalysisRequest } from '../shared/analysis-protocol';
import { AnalysisWorkspace } from './workspace';

/**
 * analysis の utility process（docs/adr/0007）。
 * import グラフ・テスト対応・ファイル監視を main のイベントループから切り離して実行する。
 */
const port = process.parentPort;
const workspaces = new Map<string, AnalysisWorkspace>();
let git: GitClient | undefined;

const post = (message: AnalysisMessage) => port.postMessage(message);
const emit = (event: AnalysisEvent) => post({ kind: 'event', event });

const workspaceOf = (root: string): AnalysisWorkspace => {
  const ws = workspaces.get(root);
  if (!ws) throw new Error(`workspace not opened: ${root}`);
  return ws;
};

const handle = async (request: AnalysisRequest): Promise<unknown> => {
  if (!git) throw new Error('analysis not initialized');
  switch (request.method) {
    case 'workspace.open': {
      const { workspace, watch, testGlobs } = request.params;
      let ws = workspaces.get(workspace);
      if (!ws) {
        ws = new AnalysisWorkspace(workspace, git, testGlobs, emit);
        workspaces.set(workspace, ws);
      }
      ws.setTestGlobs(testGlobs);
      void ws.open(watch);
      return { ready: ws.ready };
    }
    case 'workspace.close': {
      await workspaces.get(request.params.workspace)?.close();
      workspaces.delete(request.params.workspace);
      return null;
    }
    case 'workspace.status': {
      const ws = workspaces.get(request.params.workspace);
      return { ready: ws?.ready ?? false, files: ws?.graph.size ?? 0 };
    }
    case 'graph.neighborhood': {
      const { workspace, seeds, hops, includeExternal, includeTypeOnly } = request.params;
      const ws = workspaceOf(workspace);
      if (!ws.ready) return { files: [], edges: [], ready: false };
      return { ...ws.graph.neighborhood(seeds, hops, { includeExternal, includeTypeOnly }), ready: true };
    }
    case 'graph.relations': {
      const ws = workspaceOf(request.params.workspace);
      return {
        imports: ws.graph.outgoing(request.params.path),
        importedBy: ws.graph.incomingEdges(request.params.path),
        ready: ws.ready,
      };
    }
    case 'graph.diff': {
      const { workspace, repoPath, baseRev, files } = request.params;
      const ws = workspaceOf(workspace);
      if (!ws.ready) return { edges: [], ready: false };
      return { edges: await ws.graphDiff(repoPath, baseRev, files), ready: true };
    }
    case 'reviewOrder': {
      const ws = workspaceOf(request.params.workspace);
      if (!ws.ready) return { items: [], ready: false };
      return { items: ws.reviewOrder(request.params.files), ready: true };
    }
    case 'testLinks': {
      const ws = workspaceOf(request.params.workspace);
      if (!ws.ready) return { links: [], ready: false };
      const paths = request.params.paths ? new Set(request.params.paths) : null;
      const links = ws.testLinks();
      return {
        links: paths ? links.filter((l) => paths.has(l.implPath) || paths.has(l.testPath)) : links,
        ready: true,
      };
    }
    case 'files.list': {
      const ws = workspaceOf(request.params.workspace);
      return { files: ws.files, ready: ws.ready };
    }
  }
};

port.on('message', (event: { data: AnalysisMessage }) => {
  const message = event.data;
  if (message.kind === 'init') {
    git = new GitClient({ gitPath: message.gitPath });
    return;
  }
  if (message.kind !== 'request') return;
  handle(message.request).then(
    (result) => post({ kind: 'response', id: message.id, ok: true, result }),
    (error: unknown) =>
      post({
        kind: 'response',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});

process.on('uncaughtException', (error) =>
  emit({ type: 'log', level: 'error', message: `uncaught: ${error.stack ?? error.message}` }),
);
