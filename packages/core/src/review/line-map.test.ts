import { describe, expect, it } from 'vite-plus/test';

import { buildLineMapping, remapNote } from './line-map';
import { diffLines } from './simple-diff';

describe('diffLines', () => {
  it('挿入と削除を検出する', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toEqual([
      'equal',
      'delete',
      'insert',
      'equal',
      'insert',
    ]);
    expect(diffLines([], ['a'])).toEqual(['insert']);
    expect(diffLines(['a'], [])).toEqual(['delete']);
  });
});

describe('remapNote', () => {
  it('上に行が増えればメモも下にずれる', () => {
    const old = 'a\nb\nc\n';
    const next = 'new1\nnew2\na\nb\nc\n';
    expect(buildLineMapping(old, next).get(2)).toBe(4);
    expect(remapNote(old, next, { startLine: 2, endLine: 3 })).toEqual({
      anchor: { startLine: 4, endLine: 5 },
      stale: false,
    });
  });

  it('メモの行が消えれば stale', () => {
    expect(remapNote('a\nb\nc', 'a\nc', { startLine: 2, endLine: 2 }).stale).toBe(true);
  });
});
