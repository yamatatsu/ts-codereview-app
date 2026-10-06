import { describe, expect, it } from 'vite-plus/test';

import { parseTargetKey, targetKey, type ReviewTarget } from './target';

describe('targetKey / parseTargetKey', () => {
  const targets: ReviewTarget[] = [
    { kind: 'local-worktree', projectId: 'p' },
    { kind: 'local-branch', projectId: 'p', branch: 'feat/x', baseBranch: 'main' },
    { kind: 'pr', projectId: 'p', number: 12 },
  ];
  it.each(targets)('往復できる: %o', (target) => {
    expect(parseTargetKey(targetKey(target))).toEqual(target);
  });
  it('不正なキーは null', () => {
    expect(parseTargetKey('p:pr:abc')).toBeNull();
    expect(parseTargetKey('nope')).toBeNull();
  });
});
