import { describe, expect, it } from 'vite-plus/test';

import type { ChangedFile } from './target';
import { computeViewedStates, viewedProgress } from './viewed';

const file = (path: string, headBlob: string, kind: ChangedFile['kind'] = 'impl'): ChangedFile => ({
  path,
  status: 'M',
  kind,
  headBlob,
});

describe('computeViewedStates', () => {
  it('blob が一致すれば viewed、違えば changed-since-viewed', () => {
    const files = [
      file('a.ts', 'h1'),
      file('b.ts', 'h2'),
      file('c.ts', 'h3'),
      file('lock', 'h4', 'collapsed'),
    ];
    const states = computeViewedStates(files, [
      { path: 'a.ts', blobSha: 'h1', viewedAt: 1 },
      { path: 'b.ts', blobSha: 'old', viewedAt: 1 },
    ]);
    expect(states).toEqual([
      { path: 'a.ts', state: 'viewed', viewedBlob: 'h1' },
      { path: 'b.ts', state: 'changed-since-viewed', viewedBlob: 'old' },
      { path: 'c.ts', state: 'unviewed' },
      { path: 'lock', state: 'unviewed' },
    ]);
    expect(viewedProgress(files, states)).toEqual({ viewed: 1, total: 3 });
  });
});
