import type { GraphEdge } from './graph';

export type EdgeChange = 'added' | 'removed' | 'unchanged';
export type DiffedEdge = GraphEdge & { change: EdgeChange };

const keyOf = (e: GraphEdge) => `${e.from}\0${e.to}`;

/** 変更ファイルの outgoing エッジについて、base と head を比べる */
export const diffEdges = (baseEdges: readonly GraphEdge[], headEdges: readonly GraphEdge[]): DiffedEdge[] => {
  const base = new Map(baseEdges.map((e) => [keyOf(e), e]));
  const head = new Map(headEdges.map((e) => [keyOf(e), e]));
  const result: DiffedEdge[] = [];
  for (const [key, edge] of head) result.push({ ...edge, change: base.has(key) ? 'unchanged' : 'added' });
  for (const [key, edge] of base) if (!head.has(key)) result.push({ ...edge, change: 'removed' });
  return result;
};
