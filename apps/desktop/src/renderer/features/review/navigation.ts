import type { ChangedFile } from '@tsugi/core';

import type { NavLocation } from '@/stores/review';

/** 変更ファイルなら diff、それ以外は code view で開く */
export const locationFor = (
  files: readonly ChangedFile[] | undefined,
  path: string,
  line?: number,
): NavLocation => {
  const changed = files?.some((f) => f.path === path);
  return line === undefined
    ? { path, view: changed ? 'diff' : 'code' }
    : { path, line, view: changed ? 'diff' : 'code' };
};

/** diffs-container（open な shadow DOM）の中の行要素を探す */
export const findLineElement = (
  container: HTMLElement | null,
  line: number,
  side: 'additions' | 'deletions' = 'additions',
) => {
  const host = container?.querySelector('diffs-container');
  const root = host?.shadowRoot ?? container;
  if (!root) return null;
  const candidates = [...root.querySelectorAll<HTMLElement>(`[data-line="${line}"]`)];
  const sided = candidates.find((el) => el.closest(`[data-${side}]`));
  return (
    sided ??
    candidates.find((el) => el.getAttribute('data-line-type') !== 'change-deletion') ??
    candidates[0] ??
    null
  );
};

/** 縦方向だけスクロールする（scrollIntoView はコード列まで横に動かしてしまうため） */
export const scrollToLine = (container: HTMLElement | null, line: number, flash: boolean) => {
  const el = findLineElement(container, line);
  if (!el) return false;
  const scroller = container?.closest<HTMLElement>('[data-scroller]');
  if (scroller) {
    const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += offset - scroller.clientHeight / 3;
  } else {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  if (flash)
    el.animate(
      [
        { backgroundColor: 'color-mix(in oklch, var(--primary) 35%, transparent)' },
        { backgroundColor: 'transparent' },
      ],
      { duration: 1200 },
    );
  return true;
};

/** 変更行のまとまり（ハンク）の先頭要素を列挙する */
export const hunkStarts = (container: HTMLElement | null): HTMLElement[] => {
  const host = container?.querySelector('diffs-container');
  const root = host?.shadowRoot;
  if (!root) return [];
  const changed = [
    ...root.querySelectorAll<HTMLElement>(
      '[data-line-type="change-addition"], [data-line-type="change-deletion"]',
    ),
  ];
  const starts: HTMLElement[] = [];
  let lastBottom = -Infinity;
  for (const el of changed.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
    const rect = el.getBoundingClientRect();
    if (rect.top - lastBottom > 2) starts.push(el);
    lastBottom = Math.max(lastBottom, rect.bottom);
  }
  return starts;
};

export const jumpHunk = (container: HTMLElement | null, scroller: HTMLElement | null, direction: 1 | -1) => {
  if (!scroller) return;
  const starts = hunkStarts(container);
  const viewTop = scroller.getBoundingClientRect().top + 40;
  const target =
    direction === 1
      ? starts.find((el) => el.getBoundingClientRect().top > viewTop + 4)
      : [...starts].reverse().find((el) => el.getBoundingClientRect().top < viewTop - 4);
  if (target)
    scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 40;
};
