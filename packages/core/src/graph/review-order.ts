import type { GraphEdge } from './graph';

/** Tarjan の強連結成分分解。結果は「依存される側（葉）から」の順になる */
export const stronglyConnectedComponents = (
  nodes: readonly string[],
  edges: readonly GraphEdge[],
): string[][] => {
  const adjacency = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges)
    if (adjacency.has(e.from) && adjacency.has(e.to) && e.from !== e.to) adjacency.get(e.from)?.push(e.to);
  for (const list of adjacency.values()) list.sort();

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const strongConnect = (v: string) => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component.sort());
    }
  };

  for (const node of [...nodes].sort()) if (!indices.has(node)) strongConnect(node);
  // Tarjan は逆トポロジカル順（依存先が先）で成分を出力する
  return components;
};

export type ReviewOrderItem = {
  path: string;
  /** 循環グループの番号（循環していなければ null） */
  cycleGroup: number | null;
};

/**
 * 変更ファイルの推奨閲読順（docs/specs/06）。
 * - 実装ファイルの誘導部分グラフを SCC にまとめ、依存の葉から並べる
 * - テストは対応する実装（primary）の直後に入れる
 */
export const computeReviewOrder = (
  implFiles: readonly string[],
  edges: readonly GraphEdge[],
  testsByImpl: ReadonlyMap<string, readonly string[]> = new Map(),
  otherFiles: readonly string[] = [],
): ReviewOrderItem[] => {
  const components = stronglyConnectedComponents(implFiles, edges);
  const order: ReviewOrderItem[] = [];
  const placed = new Set<string>();
  let group = 0;
  for (const component of components) {
    const cycleGroup = component.length > 1 ? group++ : null;
    for (const file of component) {
      order.push({ path: file, cycleGroup });
      placed.add(file);
      for (const test of testsByImpl.get(file) ?? []) {
        if (!placed.has(test)) {
          order.push({ path: test, cycleGroup: null });
          placed.add(test);
        }
      }
    }
  }
  for (const file of [...otherFiles].sort())
    if (!placed.has(file)) order.push({ path: file, cycleGroup: null });
  return order;
};
