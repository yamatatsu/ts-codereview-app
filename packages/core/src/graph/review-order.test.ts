import { describe, expect, it } from 'vite-plus/test';

import type { GraphEdge } from './graph';
import { computeReviewOrder } from './review-order';

const e = (from: string, to: string): GraphEdge => ({ from, to, kind: 'static' });

describe('computeReviewOrder', () => {
  it('a → b → c なら c, b, a の順', () => {
    const order = computeReviewOrder(['a.ts', 'b.ts', 'c.ts'], [e('a.ts', 'b.ts'), e('b.ts', 'c.ts')]);
    expect(order.map((o) => o.path)).toEqual(['c.ts', 'b.ts', 'a.ts']);
  });

  it('循環は 1 グループにまとまる', () => {
    const order = computeReviewOrder(
      ['a.ts', 'b.ts', 'c.ts'],
      [e('a.ts', 'b.ts'), e('b.ts', 'a.ts'), e('a.ts', 'c.ts')],
    );
    expect(order).toEqual([
      { path: 'c.ts', cycleGroup: null },
      { path: 'a.ts', cycleGroup: 0 },
      { path: 'b.ts', cycleGroup: 0 },
    ]);
  });

  it('テストは対応する実装の直後、その他は末尾', () => {
    const order = computeReviewOrder(
      ['a.ts', 'b.ts'],
      [e('a.ts', 'b.ts')],
      new Map([['b.ts', ['b.test.ts']]]),
      ['b.test.ts', 'README.md'],
    );
    expect(order.map((o) => o.path)).toEqual(['b.ts', 'b.test.ts', 'a.ts', 'README.md']);
  });
});
