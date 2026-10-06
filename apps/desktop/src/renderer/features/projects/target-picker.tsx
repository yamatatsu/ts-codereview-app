import { GitBranchIcon, GitPullRequestIcon, PencilLineIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { errorText } from '@/lib/api';
import { useBranches, usePulls } from '@/lib/queries';
import { relativeTime } from '@/lib/utils';

import type { ProjectDto } from '../../../shared/dto';
import { useOpenTarget } from './use-open-target';

/** プロジェクトの ReviewTarget（ローカル差分 / PR）を選ぶ */
export function TargetPicker({ project }: { project: ProjectDto }) {
  const open = useOpenTarget();
  const branches = useBranches(project.id);
  const pulls = usePulls(project.id, project.hasPat);
  const [prNumber, setPrNumber] = useState('');
  const current = branches.data?.current ?? null;
  const [base, setBase] = useState(project.defaultBaseBranch);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">ローカル</h3>
        <Button
          variant="outline"
          className="justify-start"
          disabled={open.isPending}
          onClick={() => open.mutate({ kind: 'local-worktree', projectId: project.id })}
        >
          <PencilLineIcon />
          未コミットの変更（作業ツリー と HEAD）
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-start"
            disabled={!current || open.isPending || current === base}
            onClick={() =>
              current &&
              open.mutate({ kind: 'local-branch', projectId: project.id, branch: current, baseBranch: base })
            }
          >
            <GitBranchIcon />
            {current ?? '(detached)'} と merge-base の差分
          </Button>
          <span className="text-xs text-muted-foreground">base</span>
          <NativeSelect value={base} onChange={(e) => setBase(e.target.value)} className="w-40">
            {(branches.data?.branches ?? [project.defaultBaseBranch]).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </NativeSelect>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">GitHub Pull Request</h3>
        {!project.hasPat ? (
          <p className="text-xs text-muted-foreground">
            PR をレビューするには、プロジェクト設定で PAT を登録してください。
          </p>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(prNumber);
                if (Number.isInteger(n) && n > 0)
                  open.mutate({ kind: 'pr', projectId: project.id, number: n });
              }}
            >
              <Input
                placeholder="PR 番号"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
                className="w-32"
              />
              <Button type="submit" variant="secondary" disabled={open.isPending}>
                開く
              </Button>
            </form>
            {pulls.isLoading && <p className="text-xs text-muted-foreground">PR を取得しています…</p>}
            {pulls.error && <p className="text-xs text-destructive">{errorText(pulls.error)}</p>}
            <ul className="flex max-h-72 flex-col overflow-y-auto rounded-md border">
              {(pulls.data ?? []).map((pr) => (
                <li key={pr.number}>
                  <button
                    type="button"
                    disabled={open.isPending}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent"
                    onClick={() => open.mutate({ kind: 'pr', projectId: project.id, number: pr.number })}
                  >
                    <GitPullRequestIcon className="size-4 shrink-0 text-added" />
                    <span className="text-muted-foreground">#{pr.number}</span>
                    <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                    {pr.draft && <Badge variant="outline">draft</Badge>}
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {pr.author} · {relativeTime(pr.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
              {pulls.data?.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">open な PR はありません</li>
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
