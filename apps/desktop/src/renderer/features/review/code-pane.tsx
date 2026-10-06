import { EyeIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import Markdown from 'react-markdown';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLive } from '@/lib/queries';
import { basename } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import { CodeView } from './code-view';
import { DiffView } from './diff-view';
import { FindBar } from './find-bar';
import type { ReviewData } from './use-review-data';
import { useToggleViewed } from './use-viewed-actions';

export function CodePane({
  target,
  data,
  containerRef,
  scrollerRef,
}: {
  target: TargetDto;
  data: ReviewData;
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const location = useReviewStore((s) => s.location);
  const peek = useReviewStore((s) => s.peek);
  const setPeek = useReviewStore((s) => s.setPeek);
  const sinceViewed = useReviewStore((s) => s.sinceViewed);
  const setSinceViewed = useReviewStore((s) => s.setSinceViewed);
  const toggleViewed = useToggleViewed(target.key);
  const peekRef = useRef<HTMLDivElement>(null);

  const changed = location ? target.files.find((f) => f.path === location.path) : undefined;
  const viewedState = location ? data.viewedByPath.get(location.path) : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Banners target={target} />
      {location && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
          <span className="truncate font-medium" title={location.path} data-current-file>
            {changed?.oldPath ? `${changed.oldPath} → ` : ''}
            {location.path}
          </span>
          {!changed && <Badge variant="outline">変更なし</Badge>}
          {changed?.kind === 'test' && <Badge variant="secondary">テスト</Badge>}
          <div className="ml-auto flex items-center gap-3">
            {viewedState?.state === 'changed-since-viewed' && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={sinceViewed} onCheckedChange={setSinceViewed} />
                前回 Viewed からの差分
              </label>
            )}
            {changed && (
              <Button
                variant={viewedState?.state === 'viewed' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => void toggleViewed(changed.path, viewedState?.state === 'viewed')}
              >
                <EyeIcon />
                {viewedState?.state === 'viewed' ? 'Viewed' : 'Viewed にする'}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <FindBar />
        <div ref={scrollerRef} className="h-full overflow-auto" data-selectable data-scroller>
          <div ref={containerRef}>
            {!location ? (
              <Overview target={target} />
            ) : changed && location.view === 'diff' ? (
              <DiffView
                key={changed.path}
                target={target}
                file={changed}
                viewedBlob={viewedState?.viewedBlob}
                containerRef={containerRef}
              />
            ) : (
              <CodeView
                target={target}
                path={location.path}
                line={location.line}
                containerRef={containerRef}
              />
            )}
          </div>
        </div>
      </div>
      {peek && (
        <div className="flex max-h-[45%] shrink-0 flex-col border-t-2 border-primary/40 bg-card">
          <div className="flex h-7 items-center gap-2 border-b px-3 text-xs">
            <span className="font-medium">{basename(peek.path)}</span>
            <span className="truncate text-muted-foreground">{peek.path}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => useReviewStore.getState().navigate(peek)}
            >
              開く
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="閉じる (Esc)"
              onClick={() => setPeek(null)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
          <div ref={peekRef} className="min-h-0 overflow-auto" data-scroller>
            <CodeView target={target} path={peek.path} line={peek.line} containerRef={peekRef} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function Banners({ target }: { target: TargetDto }) {
  const logs = useLive((s) => s.installLogs[target.key]);
  const headChanged = useLive((s) => s.headChanged[target.key]);
  return (
    <>
      {target.warnings.map((w) => (
        <div key={w} className="border-b border-renamed/30 bg-renamed/10 px-3 py-1.5 text-xs">
          {w}
        </div>
      ))}
      {(target.install === 'pending' || target.install === 'running') && (
        <details className="border-b bg-muted/50 px-3 py-1.5 text-xs">
          <summary className="cursor-pointer">
            依存をインストールしています（--offline --ignore-scripts）… コードジャンプは完了後に使えます
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground">
            {(logs ?? []).join('\n')}
          </pre>
        </details>
      )}
      {target.install === 'failed' && (
        <div className="border-b border-removed/30 bg-removed/10 px-3 py-1.5 text-xs">
          依存のインストールに失敗しました。外部パッケージの型は解決されません。
        </div>
      )}
      {headChanged && headChanged !== target.headRev && (
        <div className="border-b border-primary/30 bg-primary/10 px-3 py-1.5 text-xs">
          この PR に新しいコミットがあります。⌘R で更新します。
        </div>
      )}
    </>
  );
}

function Overview({ target }: { target: TargetDto }) {
  return (
    <div className="mx-auto max-w-3xl p-6" data-selectable>
      {target.pr ? (
        <div className="grid gap-3">
          <h2 className="text-base font-semibold">
            #{target.pr.number} {target.pr.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{target.pr.author}</span>
            <span>
              {target.pr.headRef} → {target.pr.baseRef}
            </span>
            {target.pr.labels.map((l) => (
              <Badge key={l} variant="secondary">
                {l}
              </Badge>
            ))}
            {target.pr.checks && (
              <span>
                CI: ✅ {target.pr.checks.success} ❌ {target.pr.checks.failure} ⏳ {target.pr.checks.pending}
              </span>
            )}
            {target.pr.requestedReviewers.length > 0 && (
              <span>reviewers: {target.pr.requestedReviewers.join(', ')}</span>
            )}
          </div>
          <div className="prose-sm rounded-md border p-4 text-[13px] [&_a]:text-primary [&_code]:font-mono [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2">
            {target.pr.body ? (
              <Markdown>{target.pr.body}</Markdown>
            ) : (
              <span className="text-muted-foreground">本文はありません</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">
          {target.files.length} 件の変更ファイルがあります。左の一覧から選ぶか、<kbd>⌘⌥→</kbd>{' '}
          でレビュー順に読み進めます。
        </p>
      )}
    </div>
  );
}
