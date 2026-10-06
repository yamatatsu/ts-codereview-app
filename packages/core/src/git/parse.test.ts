import { describe, expect, it } from 'vite-plus/test';

import { parseCheckAttrZ, parseLsTreeZ, parseNameStatusZ, parseWorktreeListPorcelain } from './parse';

describe('parseNameStatusZ', () => {
  it('A/M/D/R をパースする', () => {
    const out = ['A', 'new.ts', 'M', 'mod.ts', 'D', 'del.ts', 'R087', 'old.ts', 'renamed.ts', ''].join('\0');
    expect(parseNameStatusZ(out)).toEqual([
      { status: 'A', path: 'new.ts' },
      { status: 'M', path: 'mod.ts' },
      { status: 'D', path: 'del.ts' },
      { status: 'R', path: 'renamed.ts', oldPath: 'old.ts' },
    ]);
  });

  it('空出力は空配列', () => {
    expect(parseNameStatusZ('')).toEqual([]);
  });
});

describe('parseLsTreeZ', () => {
  it('blob だけを拾う', () => {
    const out = '100644 blob abc123\tsrc/a.ts\u0000040000 tree def456\tsrc\u0000';
    expect(parseLsTreeZ(out)).toEqual(new Map([['src/a.ts', 'abc123']]));
  });
});

describe('parseCheckAttrZ', () => {
  it('set のものだけを返す', () => {
    const out = ['gen.ts', 'linguist-generated', 'set', 'a.ts', 'linguist-generated', 'unspecified', ''].join(
      '\0',
    );
    expect(parseCheckAttrZ(out)).toEqual(new Set(['gen.ts']));
  });
});

describe('parseWorktreeListPorcelain', () => {
  it('detached と branch を区別する', () => {
    const out = 'worktree /repo\nHEAD aaa\nbranch refs/heads/main\n\nworktree /wt\nHEAD bbb\ndetached\n';
    expect(parseWorktreeListPorcelain(out)).toEqual([
      { path: '/repo', head: 'aaa', branch: 'refs/heads/main', detached: false },
      { path: '/wt', head: 'bbb', branch: null, detached: true },
    ]);
  });
});
