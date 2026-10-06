import { parseSync } from 'oxc-parser';

export type TestCaseKind = 'describe' | 'test';

export type TestOutlineNode = {
  kind: TestCaseKind;
  name: string;
  /** describe / it / test のほかに付いた修飾（skip, only, each, todo など） */
  modifiers: string[];
  /** 1 始まりの行番号 */
  startLine: number;
  endLine: number;
  children: TestOutlineNode[];
};

const DESCRIBE_NAMES = new Set(['describe', 'suite', 'context']);
const TEST_NAMES = new Set(['it', 'test', 'bench']);

type Node = { type: string; start: number; end: number; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';

/** `describe.skip.each(...)` などの callee からベース名と修飾を取り出す */
const calleeInfo = (callee: unknown): { base: string; modifiers: string[] } | null => {
  const modifiers: string[] = [];
  let current = callee;
  for (;;) {
    if (!isNode(current)) return null;
    if (current.type === 'Identifier')
      return { base: current['name'] as string, modifiers: modifiers.reverse() };
    if (current.type === 'MemberExpression') {
      const prop = current['property'];
      if (isNode(prop) && prop.type === 'Identifier') modifiers.push(prop['name'] as string);
      current = current['object'];
      continue;
    }
    if (current.type === 'CallExpression') {
      // describe.each([...])('name', fn) の内側の呼び出し
      current = current['callee'];
      continue;
    }
    if (current.type === 'TaggedTemplateExpression') {
      current = current['tag'];
      continue;
    }
    return null;
  }
};

const nameOf = (arg: unknown, source: string): string => {
  if (!isNode(arg)) return '(anonymous)';
  if (arg.type === 'Literal' && typeof arg['value'] === 'string') return arg['value'];
  if (arg.type === 'TemplateLiteral') return source.slice(arg.start + 1, arg.end - 1);
  return source.slice(arg.start, arg.end);
};

const lineStarts = (source: string): number[] => {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
};

const lineOf = (starts: readonly number[], offset: number): number => {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

/** テストファイルの describe / it / test を木構造で抽出する（docs/specs/05） */
export const extractTestOutline = (filename: string, source: string): TestOutlineNode[] => {
  const { program } = parseSync(filename, source, { sourceType: 'module' });
  // oxc の offset は UTF-8 ではなく UTF-16 の位置で返る（JS 側の文字列インデックス）
  const starts = lineStarts(source);
  const roots: TestOutlineNode[] = [];

  const visit = (node: unknown, parent: TestOutlineNode[]): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === 'CallExpression') {
      const info = calleeInfo(node['callee']);
      if (info && (DESCRIBE_NAMES.has(info.base) || TEST_NAMES.has(info.base))) {
        const args = node['arguments'] as unknown[];
        const outline: TestOutlineNode = {
          kind: DESCRIBE_NAMES.has(info.base) ? 'describe' : 'test',
          name: nameOf(args[0], source),
          modifiers: info.modifiers,
          startLine: lineOf(starts, node.start),
          endLine: lineOf(starts, node.end),
          children: [],
        };
        parent.push(outline);
        for (const arg of args.slice(1)) visit(arg, outline.children);
        return;
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      if (typeof value === 'object' && value !== null) visit(value, parent);
    }
  };

  visit(program, roots);
  return roots;
};

/** 変更行（head 側、1 始まり）と交差するテストケースに印を付けるための判定 */
export const intersectsLines = (node: TestOutlineNode, changedLines: ReadonlySet<number>): boolean => {
  for (let line = node.startLine; line <= node.endLine; line += 1) if (changedLines.has(line)) return true;
  return false;
};
