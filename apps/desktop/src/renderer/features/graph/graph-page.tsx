import { useNavigate, useParams } from '@tanstack/react-router';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';

import '@xyflow/react/dist/style.css';
import { ArrowLeftIcon, CheckIcon, FlaskConicalIcon, PackageIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGraph, useTarget, type GraphOptions } from '@/lib/queries';
import { basename, cn, dirname } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

import type { GraphNodeDto } from '../../../shared/dto';
import { locationFor } from '../review/navigation';
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from './layout';

type FileNodeData = { node: GraphNodeDto; focused: boolean };

const STATUS_CLASS: Record<string, string> = {
  A: 'border-added bg-added/10',
  M: 'border-primary bg-primary/10',
  D: 'border-removed bg-removed/10 line-through',
  R: 'border-renamed bg-renamed/10',
};

function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const { node, focused } = data;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 text-[11px] shadow-sm',
        node.changed ? STATUS_CLASS[node.changed] : 'border-border bg-card text-muted-foreground',
        focused && 'ring-2 ring-ring',
      )}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      title={node.id}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground"
      />
      {node.external ? (
        <PackageIcon className="size-3 shrink-0" />
      ) : node.kind === 'test' ? (
        <FlaskConicalIcon className="size-3 shrink-0" />
      ) : null}
      <span className="truncate font-medium text-foreground">
        {node.external ? node.label : basename(node.label)}
      </span>
      {!node.external && <span className="truncate text-muted-foreground">{dirname(node.label)}</span>}
      {node.viewed && <CheckIcon className="ml-auto size-3 shrink-0 text-added" />}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-muted-foreground"
      />
    </div>
  );
}

const nodeTypes = { file: FileNode };

export function GraphPage() {
  const { targetKey } = useParams({ from: '/review/$targetKey/graph' });
  const navigate = useNavigate();
  const target = useTarget(targetKey);
  const [opts, setOpts] = useState<GraphOptions>({ hops: 1, tests: true, typeOnly: true, external: false });
  const [focus, setFocus] = useState<string | null>(null);
  const graph = useGraph(targetKey, opts);
  const [laidOut, setLaidOut] = useState<{ nodes: Node<FileNodeData>[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });

  // ダブルクリックしたノードを中心に、その近傍だけを表示する
  const visible = useMemo(() => {
    const data = graph.data;
    if (!data) return { nodes: [], edges: [] };
    if (!focus) return data;
    const ids = new Set([focus]);
    for (const e of data.edges) {
      if (e.from === focus) ids.add(e.to);
      if (e.to === focus) ids.add(e.from);
    }
    return {
      nodes: data.nodes.filter((n) => ids.has(n.id)),
      edges: data.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
  }, [graph.data, focus]);

  useEffect(() => {
    let cancelled = false;
    const edges = visible.edges.map((e, i) => ({
      id: `${e.from}->${e.to}#${i}`,
      source: e.from,
      target: e.to,
      e,
    }));
    void layoutGraph(visible.nodes, edges).then((layout) => {
      if (cancelled) return;
      const positions = new Map((layout.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
      setLaidOut({
        nodes: visible.nodes.map((node) => ({
          id: node.id,
          type: 'file',
          position: positions.get(node.id) ?? { x: 0, y: 0 },
          data: { node, focused: node.id === focus },
        })),
        edges: edges.map(({ id, source, target: to, e }) => ({
          id,
          source,
          target: to,
          animated: e.change === 'added',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: {
            stroke:
              e.change === 'added'
                ? 'var(--added)'
                : e.change === 'removed'
                  ? 'var(--removed)'
                  : 'var(--muted-foreground)',
            strokeDasharray: e.change === 'removed' ? '5 4' : undefined,
            strokeWidth: e.kind === 'type-only' ? 0.8 : 1.4,
            opacity: e.kind === 'type-only' ? 0.6 : 1,
          },
        })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, focus]);

  const openFile = (path: string) => {
    if (path.startsWith('npm:')) return;
    useReviewStore.getState().reset(targetKey);
    useReviewStore.getState().navigate(locationFor(target.data?.files, path));
    void navigate({ to: '/review/$targetKey', params: { targetKey } });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="app-drag flex h-11 shrink-0 items-center gap-3 border-b bg-sidebar pr-3 pl-20">
        <Button
          variant="ghost"
          size="icon"
          className="app-no-drag"
          aria-label="レビューに戻る"
          onClick={() => void navigate({ to: '/review/$targetKey', params: { targetKey } })}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="font-semibold">依存グラフ</span>
        <div className="app-no-drag ml-auto flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            ホップ数
            <NativeSelect
              value={opts.hops}
              onChange={(e) => setOpts({ ...opts, hops: Number(e.target.value) })}
              className="h-7"
            >
              {[0, 1, 2, 3].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Toggle label="テスト" checked={opts.tests} onChange={(tests) => setOpts({ ...opts, tests })} />
          <Toggle
            label="型のみの import"
            checked={opts.typeOnly}
            onChange={(typeOnly) => setOpts({ ...opts, typeOnly })}
          />
          <Toggle
            label="外部パッケージ"
            checked={opts.external}
            onChange={(external) => setOpts({ ...opts, external })}
          />
          {focus && (
            <Button variant="outline" size="sm" onClick={() => setFocus(null)}>
              全体に戻す
            </Button>
          )}
        </div>
      </header>
      <Tabs defaultValue="graph" className="min-h-0 flex-1 gap-0">
        <div className="flex items-center gap-3 border-b px-3 py-1.5">
          <TabsList>
            <TabsTrigger value="graph">グラフ</TabsTrigger>
            <TabsTrigger value="list">リスト</TabsTrigger>
          </TabsList>
          <span className="text-[11px] text-muted-foreground">
            {graph.data && !graph.data.ready
              ? '解析中…'
              : `${visible.nodes.length} ファイル / ${visible.edges.length} 依存`}
            {' · '}緑の矢印：この変更で増えた依存 / 赤の破線：消えた依存 /
            クリックで開く・ダブルクリックで近傍に絞る
          </span>
        </div>
        <TabsContent value="graph" className="h-full min-h-0">
          <ReactFlow
            nodes={laidOut.nodes}
            edges={laidOut.edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            onNodeClick={(_, node) => openFile(node.id)}
            onNodeDoubleClick={(_, node) => setFocus(node.id)}
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-card" />
          </ReactFlow>
        </TabsContent>
        <TabsContent value="list" className="min-h-0 overflow-y-auto p-3">
          <GraphList nodes={visible.nodes} edges={visible.edges} onOpen={openFile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function GraphList({
  nodes,
  edges,
  onOpen,
}: {
  nodes: GraphNodeDto[];
  edges: { from: string; to: string; change: string; kind: string }[];
  onOpen: (path: string) => void;
}) {
  const changed = nodes.filter((n) => n.changed);
  return (
    <ul className="grid max-w-4xl gap-2">
      {changed.map((node) => {
        const out = edges.filter((e) => e.from === node.id);
        const incoming = edges.filter((e) => e.to === node.id);
        return (
          <li key={node.id} className="rounded-md border p-2">
            <button
              type="button"
              className="flex items-center gap-2 font-medium"
              onClick={() => onOpen(node.id)}
            >
              <Badge variant="outline" className="font-mono">
                {node.changed}
              </Badge>
              {node.id}
            </button>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[11px] text-muted-foreground">依存先</div>
                {out.map((e) => (
                  <button
                    key={e.to}
                    type="button"
                    className={cn(
                      'block truncate text-left hover:underline',
                      e.change === 'added' && 'text-added',
                      e.change === 'removed' && 'text-removed line-through',
                    )}
                    onClick={() => onOpen(e.to)}
                  >
                    {e.to.replace(/^npm:/, '📦 ')}
                  </button>
                ))}
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">被依存</div>
                {incoming.map((e) => (
                  <button
                    key={e.from}
                    type="button"
                    className="block truncate text-left hover:underline"
                    onClick={() => onOpen(e.from)}
                  >
                    {e.from}
                  </button>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
