import type { ChangedFile, TestLink } from '@tsugi/core';
import { useMemo } from 'react';

import { useReviewOrder, useTarget, useTestLinks, useViewed } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

export type FileGroups = {
  impl: ChangedFile[];
  test: ChangedFile[];
  other: ChangedFile[];
  collapsed: ChangedFile[];
  /** ファイル間移動に使う順序（実装の直後に対応テスト） */
  sequence: ChangedFile[];
};

/** レビュー画面で使うデータをまとめる */
export const useReviewData = (key: string) => {
  const target = useTarget(key);
  const viewed = useViewed(key);
  const testLinks = useTestLinks(key);
  const reviewOrder = useReviewOrder(key);
  const fileOrder = useReviewStore((s) => s.fileOrder);

  const files = target.data?.files;
  const groups = useMemo<FileGroups>(() => {
    const list = files ?? [];
    const orderIndex = new Map<string, number>();
    if (fileOrder === 'review' && reviewOrder.data?.ready) {
      reviewOrder.data.items.forEach((item, i) => orderIndex.set(item.path, i));
    }
    const sort = (a: ChangedFile, b: ChangedFile) =>
      (orderIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
        (orderIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER) || a.path.localeCompare(b.path);
    const by = (kind: ChangedFile['kind']) => list.filter((f) => f.kind === kind).sort(sort);
    const impl = by('impl');
    const test = by('test');
    const other = by('other');
    const collapsed = by('collapsed');
    const sequence =
      orderIndex.size > 0 ? [...impl, ...test, ...other].sort(sort) : [...impl, ...test, ...other];
    return { impl, test, other, collapsed, sequence };
  }, [files, fileOrder, reviewOrder.data]);

  const linksByImpl = useMemo(() => {
    const map = new Map<string, TestLink[]>();
    for (const link of testLinks.data?.links ?? []) {
      const list = map.get(link.implPath) ?? [];
      list.push(link);
      map.set(link.implPath, list);
    }
    return map;
  }, [testLinks.data]);

  const linksByTest = useMemo(() => {
    const map = new Map<string, TestLink[]>();
    for (const link of testLinks.data?.links ?? []) {
      const list = map.get(link.testPath) ?? [];
      list.push(link);
      map.set(link.testPath, list);
    }
    return map;
  }, [testLinks.data]);

  const viewedByPath = useMemo(
    () => new Map((viewed.data?.states ?? []).map((s) => [s.path, s])),
    [viewed.data],
  );

  const cycleGroups = useMemo(
    () =>
      new Map(
        (reviewOrder.data?.items ?? [])
          .filter((i) => i.cycleGroup !== null)
          .map((i) => [i.path, i.cycleGroup]),
      ),
    [reviewOrder.data],
  );

  return {
    target,
    viewed,
    testLinks,
    reviewOrder,
    groups,
    linksByImpl,
    linksByTest,
    viewedByPath,
    cycleGroups,
  };
};

export type ReviewData = ReturnType<typeof useReviewData>;
