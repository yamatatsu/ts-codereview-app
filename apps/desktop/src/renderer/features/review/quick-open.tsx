import { useMemo, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useWorkspaceFiles } from '@/lib/queries';
import { basename, dirname } from '@/lib/utils';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import { locationFor } from './navigation';

/** ファジーではなく、部分一致＋ファイル名優先の簡易スコア */
const score = (file: string, query: string): number => {
  if (!query) return 1;
  const q = query.toLowerCase();
  const name = basename(file).toLowerCase();
  const full = file.toLowerCase();
  if (name.startsWith(q)) return 4;
  if (name.includes(q)) return 3;
  if (full.includes(q)) return 2;
  // 文字が順に現れるか
  let i = 0;
  for (const ch of full) if (ch === q[i]) i += 1;
  return i === q.length ? 1 : 0;
};

/** Cmd+P：変更ファイルを優先し、Workspace の全ファイルも検索する */
export function QuickOpen({ target }: { target: TargetDto }) {
  const open = useReviewStore((s) => s.quickOpen);
  const setOpen = useReviewStore((s) => s.setQuickOpen);
  const navigate = useReviewStore((s) => s.navigate);
  const [query, setQuery] = useState('');
  const all = useWorkspaceFiles(target.key, open);
  const changed = useMemo(() => new Set(target.files.map((f) => f.path)), [target.files]);

  const results = useMemo(() => {
    const changedList = target.files.map((f) => f.path).filter((f) => score(f, query) > 0);
    const others = (all.data?.files ?? [])
      .filter((f) => !changed.has(f))
      .map((f) => [f, score(f, query)] as const)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
      .slice(0, 50)
      .map(([f]) => f);
    return { changedList: changedList.sort((a, b) => score(b, query) - score(a, query)), others };
  }, [query, target.files, all.data, changed]);

  const select = (path: string) => {
    navigate(locationFor(target.files, path));
    setOpen(false);
    setQuery('');
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="ファイルを開く" shouldFilter={false}>
      <CommandInput placeholder="ファイル名で検索" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>見つかりません</CommandEmpty>
        {results.changedList.length > 0 && (
          <CommandGroup heading="変更ファイル">
            {results.changedList.map((f) => (
              <CommandItem key={f} value={`c:${f}`} onSelect={() => select(f)}>
                <span>{basename(f)}</span>
                <span className="truncate text-[11px] text-muted-foreground">{dirname(f)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.others.length > 0 && (
          <CommandGroup heading="Workspace">
            {results.others.map((f) => (
              <CommandItem key={f} value={`w:${f}`} onSelect={() => select(f)}>
                <span>{basename(f)}</span>
                <span className="truncate text-[11px] text-muted-foreground">{dirname(f)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
