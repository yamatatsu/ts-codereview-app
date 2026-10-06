import { beforeEach, describe, expect, it } from 'vite-plus/test';

import { useReviewStore } from './review';

beforeEach(() => {
  useReviewStore.setState({ targetKey: null });
  useReviewStore.getState().reset('t');
});

describe('ジャンプ履歴', () => {
  it('VS Code の Go Back / Go Forward と同じように動く', () => {
    const s = () => useReviewStore.getState();
    s().navigate({ path: 'a.ts', view: 'diff' });
    s().navigate({ path: 'b.ts', line: 3, view: 'code' });
    s().navigate({ path: 'c.ts', line: 9, view: 'code' });
    s().goBack();
    expect(s().location).toEqual({ path: 'b.ts', line: 3, view: 'code' });
    s().goBack();
    expect(s().location?.path).toBe('a.ts');
    s().goForward();
    expect(s().location?.path).toBe('b.ts');
    // 戻った状態から新しく移動したら forward は消える
    s().navigate({ path: 'd.ts', view: 'diff' });
    expect(s().forward).toEqual([]);
    expect(s().back.map((l) => l.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('同じ位置への移動は履歴に積まない', () => {
    const s = () => useReviewStore.getState();
    s().navigate({ path: 'a.ts', view: 'diff' });
    s().navigate({ path: 'a.ts', view: 'diff' });
    expect(s().back).toEqual([]);
  });

  it('ReviewTarget が変わったら履歴をリセットする', () => {
    const s = () => useReviewStore.getState();
    s().navigate({ path: 'a.ts', view: 'diff' });
    s().navigate({ path: 'b.ts', view: 'diff' });
    s().reset('other');
    expect(s().back).toEqual([]);
    expect(s().location).toBeNull();
  });
});
