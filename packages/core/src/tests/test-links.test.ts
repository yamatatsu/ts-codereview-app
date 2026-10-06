import { describe, expect, it } from 'vite-plus/test';

import type { GraphEdge } from '../graph/graph';
import { DEFAULT_TEST_GLOBS } from '../review/target';
import { computeTestLinks, testCandidates } from './test-links';

const e = (from: string, to: string): GraphEdge => ({ from, to, kind: 'static' });

describe('testCandidates', () => {
  it('コロケーション・__tests__・tests ミラーの候補を作る', () => {
    expect(testCandidates('src/foo.test.ts')).toContain('src/foo.ts');
    expect(testCandidates('src/foo.spec.tsx')).toContain('src/foo.tsx');
    expect(testCandidates('src/__tests__/foo.ts')).toContain('src/foo.ts');
    expect(testCandidates('src/__tests__/foo.test.ts')).toContain('src/foo.ts');
    expect(testCandidates('pkg/tests/a/foo.test.ts')).toContain('pkg/src/a/foo.ts');
    expect(testCandidates('src/foo.test.ts')).toContain('src/foo/index.ts');
  });
});

describe('computeTestLinks', () => {
  it('primary（命名一致）と indirect（import）を区別し、ヘルパーを除外する', () => {
    const files = [
      'src/foo.ts',
      'src/foo.test.ts',
      'src/bar.ts',
      'src/integration.test.ts',
      'src/test-utils/render.ts',
      'src/__tests__/baz.ts',
      'src/baz.ts',
    ];
    const edges = [
      e('src/foo.test.ts', 'src/foo.ts'),
      e('src/integration.test.ts', 'src/bar.ts'),
      e('src/integration.test.ts', 'src/foo.ts'),
      e('src/integration.test.ts', 'src/test-utils/render.ts'),
      e('src/integration.test.ts', 'npm:react'),
      e('src/bar.ts', 'src/foo.ts'),
    ];
    const links = computeTestLinks(files, edges, [...DEFAULT_TEST_GLOBS]);
    expect(links).toEqual([
      { implPath: 'src/foo.ts', testPath: 'src/foo.test.ts', strength: 'primary' },
      { implPath: 'src/baz.ts', testPath: 'src/__tests__/baz.ts', strength: 'primary' },
      { implPath: 'src/bar.ts', testPath: 'src/integration.test.ts', strength: 'indirect' },
      { implPath: 'src/foo.ts', testPath: 'src/integration.test.ts', strength: 'indirect' },
    ]);
  });
});
