import type { ChangedFile, FileViewedState } from '@tsugi/core';
import { ChevronDownIcon, ChevronRightIcon, FlaskConicalIcon, RepeatIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/select';
import { cn, basename, dirname } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

import type { ReviewData } from './use-review-data';
import { useToggleViewed } from './use-viewed-actions';

const STATUS_VARIANT = { A: 'added', M: 'outline', D: 'removed', R: 'renamed' } as const;

export function FileList({ data, targetKey }: { data: ReviewData; targetKey: string }) {
  const { groups, viewedByPath, linksByImpl, cycleGroups, viewed } = data;
  const location = useReviewStore((s) => s.location);
  const navigate = useReviewStore((s) => s.navigate);
  const fileOrder = useReviewStore((s) => s.fileOrder);
  const setFileOrder = useReviewStore((s) => s.setFileOrder);
  const toggleViewed = useToggleViewed(targetKey);
  const changedTests = new Set(groups.test.map((f) => f.path));

  const renderFile = (file: ChangedFile) => {
    const state: FileViewedState | undefined = viewedByPath.get(file.path);
    const links = linksByImpl.get(file.path) ?? [];
    const changedLinks = links.filter((l) => changedTests.has(l.testPath)).length;
    const active = location?.path === file.path;
    const cycle = cycleGroups.get(file.path);
    return (
      <li key={file.path}>
        <div
          className={cn(
            'group flex items-center gap-1.5 rounded px-2 py-1 hover:bg-accent',
            active && 'bg-accent text-accent-foreground',
          )}
        >
          <input
            type="checkbox"
            aria-label="Viewed"
            className="size-3.5 shrink-0 accent-[var(--primary)]"
            checked={state?.state === 'viewed'}
            ref={(el) => {
              if (el) el.indeterminate = state?.state === 'changed-since-viewed';
            }}
            onChange={() => toggleViewed(file.path, state?.state === 'viewed')}
            title={
              state?.state === 'changed-since-viewed' ? '前回 Viewed にしてから変更されています' : 'Viewed'
            }
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onClick={() => navigate({ path: file.path, view: 'diff' })}
            title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          >
            <Badge variant={STATUS_VARIANT[file.status]} className="w-4 justify-center px-0 font-mono">
              {file.status}
            </Badge>
            <span
              className={cn(
                'truncate',
                state?.state === 'viewed' &&
                  'text-muted-foreground line-through decoration-muted-foreground/40',
              )}
            >
              {basename(file.path)}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">{dirname(file.path)}</span>
          </button>
          {cycle !== undefined && cycle !== null && (
            <span title={`循環依存グループ ${cycle + 1}`}>
              <RepeatIcon className="size-3 text-renamed" />
            </span>
          )}
          {file.kind === 'impl' && links.length > 0 && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-[11px] text-muted-foreground',
                changedLinks > 0 && 'text-added',
              )}
              title={`対応するテスト ${links.length} 件（うち変更 ${changedLinks} 件）`}
            >
              <FlaskConicalIcon className="size-3" />
              {links.length}
            </span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {viewed.data ? `Viewed ${viewed.data.progress.viewed}/${viewed.data.progress.total}` : ''}
        </span>
        <NativeSelect
          value={fileOrder}
          onChange={(e) => setFileOrder(e.target.value as 'review' | 'path')}
          className="h-6 text-[11px]"
          aria-label="並び順"
        >
          <option value="review">レビュー順</option>
          <option value="path">パス順</option>
        </NativeSelect>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <Group title="実装" count={groups.impl.length}>
          {groups.impl.map(renderFile)}
        </Group>
        <Group title="テスト" count={groups.test.length}>
          {groups.test.map(renderFile)}
        </Group>
        <Group title="その他" count={groups.other.length}>
          {groups.other.map(renderFile)}
        </Group>
        <Group title="折りたたみ（lockfile・生成物など）" count={groups.collapsed.length} defaultOpen={false}>
          {groups.collapsed.map(renderFile)}
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section className="mb-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-medium text-muted-foreground uppercase"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDownIcon className="size-3" /> : <ChevronRightIcon className="size-3" />}
        {title}
        <span className="ml-auto">{count}</span>
      </button>
      {open && <ul>{children}</ul>}
    </section>
  );
}
