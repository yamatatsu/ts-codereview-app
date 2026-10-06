import { useLive, useLspStatus } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import type { ReviewData } from './use-review-data';

const LSP_LABEL: Record<string, string> = {
  starting: 'TS 起動中',
  indexing: 'TS 解析中',
  ready: 'TS ready',
  error: 'TS エラー',
  stopped: 'TS 停止中',
};

export function StatusBar({ target, data }: { target: TargetDto; data: ReviewData }) {
  const initial = useLspStatus(target.key);
  const live = useLive((s) => s.lsp[target.workspacePath]);
  const progress = useLive((s) => s.progress[target.workspacePath]);
  const cursor = useReviewStore((s) => s.cursor);
  const lsp = live ?? initial.data;
  const status = lsp?.status ?? 'stopped';
  const graphReady = data.reviewOrder.data?.ready;
  const viewed = data.viewed.data?.progress;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1" title={lsp?.message}>
        <span
          className={cn(
            'size-1.5 rounded-full',
            status === 'ready' ? 'bg-added' : status === 'error' ? 'bg-removed' : 'bg-renamed',
          )}
        />
        {LSP_LABEL[status] ?? status}
      </span>
      <span>
        {graphReady
          ? '依存グラフ ready'
          : progress
            ? `依存グラフ構築中 ${progress.done}/${progress.total}`
            : '依存グラフ構築中…'}
      </span>
      {viewed && (
        <span>
          Viewed {viewed.viewed}/{viewed.total}
        </span>
      )}
      <span className="ml-auto font-mono">
        {cursor
          ? `${cursor.path.split('/').pop()}:${cursor.line}:${cursor.character + 1}${cursor.side === 'base' ? ' (base)' : ''}`
          : ''}
      </span>
      <span>
        {target.headRev === 'WORKTREE'
          ? 'HEAD → 作業ツリー'
          : `${target.baseRev.slice(0, 7)}..${target.headRev.slice(0, 7)}`}
      </span>
    </footer>
  );
}
