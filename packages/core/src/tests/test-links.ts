import path from 'node:path';

import { isExternalNode, type GraphEdge } from '../graph/graph';
import { createMatcher } from '../util/glob';

export type TestLinkStrength = 'primary' | 'indirect';
export type TestLink = { implPath: string; testPath: string; strength: TestLinkStrength };

const TS_EXT = ['.ts', '.tsx', '.mts', '.cts'];
const HELPER_DIRS = ['test-utils', 'test-helpers', 'fixtures', '__fixtures__', '__mocks__', 'testing'];

const stripTestSuffix = (base: string): string => base.replace(/\.(test|spec)$/, '');

/** テストファイルのパスから、命名規約で対応する実装ファイルの候補を作る（docs/specs/05） */
export const testCandidates = (testPath: string): string[] => {
  const dir = path.posix.dirname(testPath);
  const ext = path.posix.extname(testPath);
  const name = stripTestSuffix(path.posix.basename(testPath, ext));
  const bases: string[] = [];

  // foo.test.ts → foo.ts（同じディレクトリ）
  bases.push(path.posix.join(dir, name));
  // __tests__/foo.ts → ../foo.ts
  const segments = dir.split('/');
  const testsIdx = segments.lastIndexOf('__tests__');
  if (testsIdx >= 0) {
    const parent = segments.slice(0, testsIdx).join('/');
    const rest = segments.slice(testsIdx + 1).join('/');
    bases.push(path.posix.join(parent, rest, name));
  }
  // tests/a/b/foo.test.ts → src/a/b/foo.ts（パッケージルート基準のミラー）
  for (const testDir of ['test', 'tests']) {
    const idx = segments.lastIndexOf(testDir);
    if (idx >= 0) {
      const root = segments.slice(0, idx).join('/');
      const rest = segments.slice(idx + 1).join('/');
      bases.push(path.posix.join(root, 'src', rest, name));
      bases.push(path.posix.join(root, 'lib', rest, name));
      bases.push(path.posix.join(root, rest, name));
    }
  }
  const candidates: string[] = [];
  for (const base of bases) {
    const normalized = base.replace(/^\.\//, '');
    for (const e of [ext, ...TS_EXT]) candidates.push(normalized + e);
    for (const e of TS_EXT) candidates.push(`${normalized}/index${e}`);
  }
  return [...new Set(candidates)];
};

export const isTestHelper = (file: string, isTest: (f: string) => boolean): boolean =>
  isTest(file) || file.split('/').some((seg) => HELPER_DIRS.includes(seg));

/**
 * primary（命名一致）と indirect（テストから直接 import されている実装）を算出する。
 * @param allFiles Workspace 内のファイル一覧（相対パス）
 * @param edges import グラフのエッジ（テストファイルの outgoing を含むこと）
 */
export const computeTestLinks = (
  allFiles: readonly string[],
  edges: readonly GraphEdge[],
  testGlobs: readonly string[],
): TestLink[] => {
  const isTest = createMatcher(testGlobs);
  const fileSet = new Set(allFiles);
  const links: TestLink[] = [];
  const seen = new Set<string>();
  const tests = allFiles.filter(isTest);

  for (const testPath of tests) {
    const primary = testCandidates(testPath).find((c) => c !== testPath && fileSet.has(c) && !isTest(c));
    if (primary) {
      links.push({ implPath: primary, testPath, strength: 'primary' });
      seen.add(`${primary}\0${testPath}`);
    }
  }
  for (const edge of edges) {
    if (!isTest(edge.from) || isExternalNode(edge.to) || !fileSet.has(edge.to)) continue;
    if (isTestHelper(edge.to, isTest)) continue;
    const key = `${edge.to}\0${edge.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ implPath: edge.to, testPath: edge.from, strength: 'indirect' });
  }
  return links;
};

export const testsByImpl = (
  links: readonly TestLink[],
  strength?: TestLinkStrength,
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const link of links) {
    if (strength && link.strength !== strength) continue;
    const list = map.get(link.implPath) ?? [];
    list.push(link.testPath);
    map.set(link.implPath, list);
  }
  return map;
};
