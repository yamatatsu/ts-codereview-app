import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
// 無変換のアセットとして読み込み、classic worker で起動する
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

/** elkjs のレイアウト計算は、elkjs 同梱の worker で行う（docs/adr/0018） */
let elk: InstanceType<typeof ELK> | undefined;
const getElk = () => {
  elk ??= new ELK({
    workerFactory: () => new Worker(elkWorkerUrl),
    workerUrl: '',
  });
  return elk;
};

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 34;

/** レイヤードレイアウト（依存先が右に来る） */
export const layoutGraph = (
  nodes: { id: string }[],
  edges: { id: string; source: string; target: string }[],
) =>
  getElk().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': '18',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
    },
    children: nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  } satisfies ElkNode);
