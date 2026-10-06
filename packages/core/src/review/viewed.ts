import type { ViewedRecord } from '../db/repositories';
import type { ChangedFile } from './target';

export type ViewedState = 'viewed' | 'changed-since-viewed' | 'unviewed';

export type FileViewedState = {
  path: string;
  state: ViewedState;
  /** 前回見たときの blob（差分の差分に使う） */
  viewedBlob?: string | undefined;
};

/** blob の一致で Viewed の状態を判定する（docs/specs/08） */
export const computeViewedStates = (
  files: readonly ChangedFile[],
  records: readonly ViewedRecord[],
): FileViewedState[] => {
  const byPath = new Map(records.map((r) => [r.path, r]));
  return files.map((file) => {
    const record = byPath.get(file.path);
    if (!record) return { path: file.path, state: 'unviewed' };
    const current = file.headBlob ?? `deleted:${file.baseBlob ?? ''}`;
    return {
      path: file.path,
      state: record.blobSha === current ? 'viewed' : 'changed-since-viewed',
      viewedBlob: record.blobSha,
    };
  });
};

/** Viewed として記録する blob。削除ファイルは base の blob に印を付けて使う */
export const viewedBlobOf = (file: ChangedFile): string => file.headBlob ?? `deleted:${file.baseBlob ?? ''}`;

export const viewedProgress = (
  files: readonly ChangedFile[],
  states: readonly FileViewedState[],
): { viewed: number; total: number } => {
  const counted = new Set(files.filter((f) => f.kind !== 'collapsed').map((f) => f.path));
  return {
    viewed: states.filter((s) => counted.has(s.path) && s.state === 'viewed').length,
    total: counted.size,
  };
};
