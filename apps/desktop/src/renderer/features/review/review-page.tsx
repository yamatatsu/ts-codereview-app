import { useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { errorText } from '@/lib/api';
import { useReviewStore } from '@/stores/review';

import { CodePane } from './code-pane';
import { CommandPalette } from './command-palette';
import { ContextPanel } from './context-panel';
import { FileList } from './file-list';
import { HoverCard } from './hover-card';
import { QuickOpen } from './quick-open';
import { ReviewHeader } from './review-header';
import { StatusBar } from './status-bar';
import { useReviewCommands } from './use-review-commands';
import { useReviewData } from './use-review-data';

export function ReviewPage() {
  const { targetKey } = useParams({ from: '/review/$targetKey' });
  const data = useReviewData(targetKey);
  const target = data.target.data;
  const reset = useReviewStore((s) => s.reset);
  const sidebarVisible = useReviewStore((s) => s.sidebarVisible);
  const panelVisible = useReviewStore((s) => s.panelVisible);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const run = useReviewCommands(target, data, { container: containerRef, scroller: scrollerRef });

  useEffect(() => reset(targetKey), [reset, targetKey]);

  return (
    <div className="flex h-full flex-col">
      <ReviewHeader target={target} run={run} />
      {data.target.error ? (
        <p className="p-6 text-destructive">{errorText(data.target.error)}</p>
      ) : !target ? (
        <p className="p-6 text-muted-foreground">差分を読み込んでいます…</p>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            {sidebarVisible && (
              <aside className="w-72 shrink-0 border-r bg-sidebar">
                <FileList data={data} targetKey={targetKey} />
              </aside>
            )}
            <section className="min-w-0 flex-1">
              <CodePane target={target} data={data} containerRef={containerRef} scrollerRef={scrollerRef} />
            </section>
            {panelVisible && (
              <aside className="w-80 shrink-0 border-l bg-sidebar">
                <ContextPanel target={target} data={data} />
              </aside>
            )}
          </div>
          <StatusBar target={target} data={data} />
          <QuickOpen target={target} />
          <CommandPalette run={run} />
          <HoverCard />
        </>
      )}
    </div>
  );
}
