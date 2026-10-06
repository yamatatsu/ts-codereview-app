import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FolderPlusIcon, SettingsIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient, useLive, useProjects, useSettings } from '@/lib/queries';
import { relativeTime } from '@/lib/utils';

import type { ProjectDto } from '../../../shared/dto';
import { TargetPicker } from './target-picker';

export function ProjectsPage() {
  const projects = useProjects();
  const settings = useSettings();
  const stale = useLive((s) => s.stale);
  const [selected, setSelected] = useState<ProjectDto | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const { path } = await unwrap(api.dialog.directory.$post());
      if (!path) return null;
      return unwrap(api.projects.$post({ json: { rootPath: path } }));
    },
    onSuccess: (project) => {
      if (!project) return;
      void queryClient.invalidateQueries({ queryKey: qk.projects });
      toast.success(`${project.name} を登録しました`);
      setSelected(project);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const gitMissing = settings.data && !settings.data.executables.git;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      {gitMissing && (
        <div className="flex items-center gap-2 rounded-md border border-renamed/40 bg-renamed/10 p-3 text-xs">
          <TriangleAlertIcon className="size-4 text-renamed" />
          git の実行ファイルが見つかりません。
          <Link to="/settings" className="underline">
            設定
          </Link>
          でパスを指定してください。
        </div>
      )}
      {stale.length > 0 && (
        <div className="rounded-md border p-3 text-xs text-muted-foreground">
          長い間開いていない PR の worktree があります（
          {stale.map((s) => `#${s.prNumber}（${s.days} 日）`).join('、')}）。
          <Link to="/settings" className="ml-1 underline">
            設定
          </Link>
          から削除できます。
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">プロジェクト</h1>
        <Button onClick={() => add.mutate()} disabled={add.isPending || !!gitMissing}>
          <FolderPlusIcon />
          リポジトリを追加
        </Button>
      </div>
      {projects.data?.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          レビューしたいリポジトリ（git clone 済みのディレクトリ）を追加してください。
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {(projects.data ?? []).map((project) => (
          <li key={project.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(project)}>
              <div className="font-medium">{project.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {project.rootPath}
                {project.githubRemote && ` · ${project.githubRemote}`}
                {project.lastOpenedAt && ` · ${relativeTime(project.lastOpenedAt)}`}
              </div>
            </button>
            <Button variant="secondary" size="sm" onClick={() => setSelected(project)}>
              レビューを開始
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link
                to="/projects/$projectId/settings"
                params={{ projectId: project.id }}
                aria-label="プロジェクト設定"
              >
                <SettingsIcon />
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.name} をレビュー</DialogTitle>
            <DialogDescription>レビューする差分を選んでください。</DialogDescription>
          </DialogHeader>
          {selected && <TargetPicker project={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
