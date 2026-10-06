import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { create } from 'zustand';

import type { ServerEvent } from '../../shared/events';
import { api, unwrap } from './api';
import { subscribeEvents } from './events';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const qk = {
  projects: ['projects'] as const,
  settings: ['settings'] as const,
  encryption: ['encryption'] as const,
  worktrees: (size: boolean) => ['worktrees', size] as const,
  branches: (projectId: string) => ['branches', projectId] as const,
  pulls: (projectId: string) => ['pulls', projectId] as const,
  target: (key: string) => ['target', key] as const,
  blobs: (key: string, path: string) => ['target', key, 'blobs', path] as const,
  blobSha: (key: string, sha: string) => ['blobSha', key, sha] as const,
  fs: (key: string, path: string) => ['target', key, 'fs', path] as const,
  viewed: (key: string) => ['target', key, 'viewed'] as const,
  notes: (key: string) => ['target', key, 'notes'] as const,
  reviewOrder: (key: string) => ['target', key, 'analysis', 'review-order'] as const,
  testLinks: (key: string) => ['target', key, 'analysis', 'test-links'] as const,
  relations: (key: string, path: string) => ['target', key, 'analysis', 'relations', path] as const,
  graph: (key: string, opts: object) => ['target', key, 'analysis', 'graph', opts] as const,
  files: (key: string) => ['target', key, 'analysis', 'files'] as const,
  outline: (key: string, path: string) => ['target', key, 'outline', path] as const,
  symbols: (key: string, path: string) => ['target', key, 'symbols', path] as const,
  lspStatus: (key: string) => ['target', key, 'lsp-status'] as const,
};

export const useProjects = () =>
  useQuery({ queryKey: qk.projects, queryFn: () => unwrap(api.projects.$get()), staleTime: 0 });

export const useSettings = () =>
  useQuery({ queryKey: qk.settings, queryFn: () => unwrap(api.settings.$get()) });

export const useEncryption = () =>
  useQuery({ queryKey: qk.encryption, queryFn: () => unwrap(api.settings.encryption.$get()) });

export const useWorktrees = (size: boolean) =>
  useQuery({
    queryKey: qk.worktrees(size),
    queryFn: () => unwrap(api.worktrees.$get({ query: { size: String(size) as 'true' | 'false' } })),
  });

export const useBranches = (projectId: string | undefined) =>
  useQuery({
    queryKey: qk.branches(projectId ?? ''),
    enabled: !!projectId,
    queryFn: () => unwrap(api.projects[':id'].branches.$get({ param: { id: projectId ?? '' } })),
  });

export const usePulls = (projectId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: qk.pulls(projectId ?? ''),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
    queryFn: () => unwrap(api.projects[':id'].pulls.$get({ param: { id: projectId ?? '' } })),
  });

const targetApi = api.targets[':key'];

export const useTarget = (key: string) =>
  useQuery({
    queryKey: qk.target(key),
    queryFn: () => unwrap(targetApi.$get({ param: { key } })),
    staleTime: Infinity,
  });

export const useBlobs = (key: string, path: string | undefined) =>
  useQuery({
    queryKey: qk.blobs(key, path ?? ''),
    enabled: !!path,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    queryFn: () => unwrap(targetApi.blobs.$get({ param: { key }, query: { path: path ?? '' } })),
  });

export const useBlobBySha = (key: string, sha: string | undefined) =>
  useQuery({
    queryKey: qk.blobSha(key, sha ?? ''),
    enabled: !!sha,
    staleTime: Infinity,
    queryFn: () => unwrap(targetApi.blob[':sha'].$get({ param: { key, sha: sha ?? '' } })),
  });

export const useWorkspaceFile = (key: string, path: string | undefined) =>
  useQuery({
    queryKey: qk.fs(key, path ?? ''),
    enabled: !!path,
    staleTime: Infinity,
    queryFn: () => unwrap(targetApi.fs.$get({ param: { key }, query: { path: path ?? '' } })),
  });

export const useViewed = (key: string) =>
  useQuery({ queryKey: qk.viewed(key), queryFn: () => unwrap(targetApi.viewed.$get({ param: { key } })) });

export const useNotes = (key: string) =>
  useQuery({ queryKey: qk.notes(key), queryFn: () => unwrap(targetApi.notes.$get({ param: { key } })) });

/** 解析が終わるまでは ready: false が返るので、短い間隔で再取得する */
const analysisRefetch = (data: { ready: boolean } | undefined) => (data && !data.ready ? 1000 : false);

export const useReviewOrder = (key: string) =>
  useQuery({
    queryKey: qk.reviewOrder(key),
    queryFn: () => unwrap(targetApi['review-order'].$get({ param: { key } })),
    refetchInterval: (q) => analysisRefetch(q.state.data),
  });

export const useTestLinks = (key: string) =>
  useQuery({
    queryKey: qk.testLinks(key),
    queryFn: () => unwrap(targetApi['test-links'].$get({ param: { key } })),
    refetchInterval: (q) => analysisRefetch(q.state.data),
  });

export const useWorkspaceFiles = (key: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.files(key),
    enabled,
    queryFn: () => unwrap(targetApi.files.$get({ param: { key } })),
    refetchInterval: (q) => analysisRefetch(q.state.data),
  });

export const useRelations = (key: string, path: string | undefined) =>
  useQuery({
    queryKey: qk.relations(key, path ?? ''),
    enabled: !!path,
    queryFn: () => unwrap(targetApi.relations.$get({ param: { key }, query: { path: path ?? '' } })),
    refetchInterval: (q) => analysisRefetch(q.state.data),
  });

export type GraphOptions = { hops: number; tests: boolean; typeOnly: boolean; external: boolean };

export const useGraph = (key: string, opts: GraphOptions) =>
  useQuery({
    queryKey: qk.graph(key, opts),
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(
        targetApi.graph.$get({
          param: { key },
          query: {
            hops: String(opts.hops),
            tests: String(opts.tests) as 'true' | 'false',
            typeOnly: String(opts.typeOnly) as 'true' | 'false',
            external: String(opts.external) as 'true' | 'false',
          },
        }),
      ),
    refetchInterval: (q) => analysisRefetch(q.state.data),
  });

export const useTestOutline = (key: string, path: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: qk.outline(key, path ?? ''),
    enabled: !!path && enabled,
    queryFn: () => unwrap(targetApi['test-outline'].$get({ param: { key }, query: { path: path ?? '' } })),
  });

export const useSymbols = (key: string, path: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: qk.symbols(key, path ?? ''),
    enabled: !!path && enabled,
    retry: false,
    queryFn: () => unwrap(targetApi.lsp.symbols.$get({ param: { key }, query: { path: path ?? '' } })),
  });

export const useLspStatus = (key: string) =>
  useQuery({
    queryKey: qk.lspStatus(key),
    queryFn: () => unwrap(targetApi.lsp.status.$get({ param: { key } })),
  });

/** worktree の install ログなど、SSE で届く一時的な状態 */
type LiveState = {
  installLogs: Record<string, string[]>;
  headChanged: Record<string, string>;
  lsp: Record<string, { status: string; message?: string }>;
  progress: Record<string, { done: number; total: number }>;
  stale: Extract<ServerEvent, { type: 'worktree.stale' }>[];
};

export const useLive = create<LiveState>(() => ({
  installLogs: {},
  headChanged: {},
  lsp: {},
  progress: {},
  stale: [],
}));

/** SSE のイベントを TanStack Query のキャッシュ無効化に変換する（docs/adr/0018） */
export const startEventBridge = (): (() => void) =>
  subscribeEvents((event) => {
    switch (event.type) {
      case 'workspace.changed':
        void queryClient.invalidateQueries({ queryKey: ['target', event.targetKey] });
        break;
      case 'analysis.ready':
        useLive.setState((s) => {
          const progress = { ...s.progress };
          delete progress[event.workspace];
          return { progress };
        });
        void queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] === 'target' && q.queryKey[2] === 'analysis',
        });
        break;
      case 'analysis.progress':
        useLive.setState((s) => ({
          progress: { ...s.progress, [event.workspace]: { done: event.done, total: event.total } },
        }));
        break;
      case 'lsp.status':
        useLive.setState((s) => ({
          lsp: {
            ...s.lsp,
            [event.workspace]: event.message
              ? { status: event.status, message: event.message }
              : { status: event.status },
          },
        }));
        break;
      case 'worktree.install.log':
        useLive.setState((s) => ({
          installLogs: {
            ...s.installLogs,
            [event.targetKey]: [...(s.installLogs[event.targetKey] ?? []), event.line].slice(-200),
          },
        }));
        break;
      case 'worktree.install.done':
        void queryClient.invalidateQueries({ queryKey: ['target', event.targetKey] });
        void queryClient.invalidateQueries({ queryKey: ['worktrees'] });
        break;
      case 'pr.headChanged':
        useLive.setState((s) => ({ headChanged: { ...s.headChanged, [event.targetKey]: event.newHeadSha } }));
        break;
      case 'worktree.stale':
        useLive.setState((s) =>
          s.stale.some((x) => x.worktreeId === event.worktreeId) ? s : { stale: [...s.stale, event] },
        );
        break;
    }
  });
