import type {
  ChangedFile,
  CodeLocation,
  DiffedEdge,
  DocumentSymbolInfo,
  FileViewedState,
  HoverInfo,
  LspStatus,
  NoteAnchor,
  PullDetail,
  ReviewOrderItem,
  ReviewTarget,
  TestLink,
  TestOutlineNode,
  ChecksSummary,
} from '@tsugi/core';

export type ProjectDto = {
  id: string;
  name: string;
  rootPath: string;
  defaultBaseBranch: string;
  githubRemote: string | null;
  hasPat: boolean;
  collapsedGlobs: string[];
  testGlobs: string[];
  lastOpenedAt: number | null;
};

export type InstallStatus = 'pending' | 'running' | 'ok' | 'fallback' | 'failed';

export type TargetDto = {
  key: string;
  target: ReviewTarget;
  baseRev: string;
  headRev: string;
  workspacePath: string;
  files: ChangedFile[];
  warnings: string[];
  pr?: (PullDetail & { checks: ChecksSummary | null }) | undefined;
  install?: InstallStatus | undefined;
};

export type BlobsDto = {
  path: string;
  base: { name: string; contents: string } | null;
  head: { name: string; contents: string } | null;
  binary: boolean;
};

export type WorkspaceFileDto = {
  path: string;
  /** Workspace からの相対パス（外部の .d.ts は node_modules からの相対） */
  relativePath: string;
  contents: string;
  external: boolean;
};

export type LocationDto = CodeLocation & {
  /** Workspace からの相対パス */
  relativePath: string;
  external: boolean;
  /** 該当行のテキスト（参照一覧の表示用） */
  preview: string;
};

export type GraphNodeDto = {
  id: string;
  label: string;
  external: boolean;
  changed: ChangedFile['status'] | null;
  kind: ChangedFile['kind'] | 'unchanged';
  viewed: boolean;
};

export type GraphDto = {
  nodes: GraphNodeDto[];
  edges: DiffedEdge[];
  ready: boolean;
};

export type FileRelationsDto = {
  imports: { path: string; kind: string; external: boolean }[];
  importedBy: { path: string; kind: string }[];
};

export type ReviewOrderDto = { items: ReviewOrderItem[]; ready: boolean };

export type TestLinksDto = { links: TestLink[]; ready: boolean };

export type TestOutlineDto = { nodes: (TestOutlineNode & { changed: boolean })[] };

export type ViewedDto = { states: FileViewedState[]; progress: { viewed: number; total: number } };

export type NoteDto = {
  id: string;
  path: string;
  blobSha: string;
  startLine: number;
  endLine: number;
  body: string;
  stale: boolean;
  createdAt: number;
  updatedAt: number;
};

export type LspStatusDto = { status: LspStatus; message?: string };

export type DetectedExecutableDto = { name: string; path: string | null; version: string | null };

export type WorktreeDto = {
  id: string;
  projectId: string;
  projectName: string;
  prNumber: number;
  path: string;
  headSha: string;
  installStatus: InstallStatus;
  lastOpenedAt: number;
  sizeBytes: number | null;
};

export type PullListItemDto = {
  number: number;
  title: string;
  author: string | null;
  headRef: string;
  baseRef: string;
  updatedAt: string;
  draft: boolean;
};

export type { CodeLocation, DocumentSymbolInfo, HoverInfo, NoteAnchor };
