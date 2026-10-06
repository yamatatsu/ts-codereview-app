import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { create } from 'zustand';

import { api, unwrap } from '@/lib/api';
import { useReviewStore, type Cursor } from '@/stores/review';

import { lspPosition } from './use-lsp-actions';

type HoverState = {
  anchor: DOMRect | null;
  contents: string | null;
  kind: 'markdown' | 'plaintext';
};

export const useHover = create<HoverState>(() => ({ anchor: null, contents: null, kind: 'markdown' }));

let timer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let requestSeq = 0;

/** トークンにホバーしてから 300ms 後に LSP の hover を取得する（docs/specs/03） */
export const scheduleHover = (targetKey: string, cursor: Cursor, element: HTMLElement) => {
  clearTimeout(timer);
  clearTimeout(hideTimer);
  if (cursor.side === 'base') return;
  const seq = ++requestSeq;
  timer = setTimeout(async () => {
    try {
      const info = await unwrap(
        api.targets[':key'].lsp.hover.$post({ param: { key: targetKey }, json: lspPosition(cursor) }),
      );
      if (seq !== requestSeq) return;
      if (!info) {
        useHover.setState({ anchor: null, contents: null });
        return;
      }
      useHover.setState({
        anchor: element.getBoundingClientRect(),
        contents: info.contents,
        kind: info.kind,
      });
    } catch {
      // hover の失敗は表示しない
    }
  }, 300);
};

export const cancelHover = () => {
  clearTimeout(timer);
  requestSeq += 1;
  hideTimer = setTimeout(() => useHover.setState({ anchor: null, contents: null }), 200);
};

export function HoverCard() {
  const { anchor, contents, kind } = useHover();
  const location = useReviewStore((s) => s.location);
  // 移動したら hover を消す
  useEffect(() => useHover.setState({ anchor: null, contents: null }), [location]);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!anchor || !ref.current) return;
    const height = ref.current.offsetHeight;
    const top = anchor.top - height - 6 > 8 ? anchor.top - height - 6 : anchor.bottom + 6;
    setStyle({ top, left: Math.min(anchor.left, window.innerWidth - 520) });
  }, [anchor, contents]);

  if (!anchor || !contents) return null;
  return (
    <div
      ref={ref}
      data-selectable
      onMouseEnter={() => clearTimeout(hideTimer)}
      onMouseLeave={cancelHover}
      className="fixed z-50 max-h-80 max-w-[500px] overflow-auto rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-lg [&_code]:font-mono [&_p]:my-1 [&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-[12px]"
      style={style}
    >
      {kind === 'markdown' ? (
        <Markdown>{contents}</Markdown>
      ) : (
        <pre className="whitespace-pre-wrap">{contents}</pre>
      )}
    </div>
  );
}
