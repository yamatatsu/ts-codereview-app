export const DEFAULT_TEST_GLOBS = [
  '**/*.{test,spec}.{ts,tsx,mts,cts}',
  '**/__tests__/**/*.{ts,tsx,mts,cts}',
] as const;

export const DEFAULT_COLLAPSED_GLOBS = [
  'pnpm-lock.yaml',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/*.snap',
  '**/dist/**',
] as const;

export const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

export type ReviewTarget =
  | { kind: 'local-worktree'; projectId: string }
  | { kind: 'local-branch'; projectId: string; branch: string; baseBranch: string }
  | { kind: 'pr'; projectId: string; number: number };

export type FileKind = 'impl' | 'test' | 'collapsed' | 'other';
export type FileStatus = 'A' | 'M' | 'D' | 'R';

export type ChangedFile = {
  path: string;
  oldPath?: string | undefined;
  status: FileStatus;
  kind: FileKind;
  baseBlob?: string | undefined;
  headBlob?: string | undefined;
};

/** head が作業ツリーのとき */
export const WORKTREE = 'WORKTREE';

export type ResolvedTarget = {
  key: string;
  target: ReviewTarget;
  baseRev: string;
  headRev: string;
  /** head 側のファイルが実在するディレクトリ */
  workspacePath: string;
  /** git コマンドを実行するリポジトリ（clone 本体） */
  repoPath: string;
  files: ChangedFile[];
  /** 警告（例：worktree と head が一致しない可能性） */
  warnings: string[];
};

export const targetKey = (target: ReviewTarget): string => {
  switch (target.kind) {
    case 'local-worktree':
      return `${target.projectId}:local-worktree`;
    case 'local-branch':
      return `${target.projectId}:local-branch:${target.branch}..${target.baseBranch}`;
    case 'pr':
      return `${target.projectId}:pr:${target.number}`;
  }
};

/** projectId を除いた、DB 保存用のキー（Viewed / Note の紐づけ先） */
export const targetLocalKey = (target: ReviewTarget): string => {
  switch (target.kind) {
    case 'local-worktree':
      return 'local-worktree';
    case 'local-branch':
      return `local-branch:${target.branch}`;
    case 'pr':
      return `pr:${target.number}`;
  }
};

export const parseTargetKey = (key: string): ReviewTarget | null => {
  const [projectId, kind, ...rest] = key.split(':');
  if (!projectId || !kind) return null;
  if (kind === 'local-worktree') return { kind, projectId };
  if (kind === 'pr') {
    const number = Number(rest[0]);
    return Number.isInteger(number) && number > 0 ? { kind, projectId, number } : null;
  }
  if (kind === 'local-branch') {
    const spec = rest.join(':');
    const sep = spec.lastIndexOf('..');
    if (sep <= 0) return null;
    return { kind, projectId, branch: spec.slice(0, sep), baseBranch: spec.slice(sep + 2) };
  }
  return null;
};

export const isTsFile = (file: string): boolean =>
  TS_EXTENSIONS.some((ext) => file.endsWith(ext)) && !file.endsWith('.d.ts');
