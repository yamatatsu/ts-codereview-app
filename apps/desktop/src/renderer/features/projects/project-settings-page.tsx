import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeftIcon, KeyRoundIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient, useEncryption, useProjects } from '@/lib/queries';

import type { ProjectDto } from '../../../shared/dto';

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export function ProjectSettingsPage() {
  const { projectId } = useParams({ from: '/projects/$projectId/settings' });
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === projectId);
  if (!project) return <div className="p-6 text-muted-foreground">読み込み中…</div>;
  return <ProjectSettingsForm key={project.id} project={project} />;
}

function ProjectSettingsForm({ project }: { project: ProjectDto }) {
  const projectId = project.id;
  const navigate = useNavigate();
  const encryption = useEncryption();
  const [name, setName] = useState(project.name);
  const [base, setBase] = useState(project.defaultBaseBranch);
  const [remote, setRemote] = useState(project.githubRemote ?? '');
  const [collapsed, setCollapsed] = useState(project.collapsedGlobs.join('\n'));
  const [tests, setTests] = useState(project.testGlobs.join('\n'));
  const [token, setToken] = useState('');

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.projects });
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.projects[':id'].$patch({
          param: { id: projectId },
          json: {
            name,
            defaultBaseBranch: base,
            githubRemote: remote.trim() || null,
            collapsedGlobs: lines(collapsed),
            testGlobs: lines(tests),
          },
        }),
      ),
    onSuccess: () => {
      invalidate();
      toast.success('保存しました');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const savePat = useMutation({
    mutationFn: () => unwrap(api.projects[':id'].pat.$put({ param: { id: projectId }, json: { token } })),
    onSuccess: () => {
      setToken('');
      invalidate();
      toast.success('PAT を保存しました（疎通確認済み）');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const deletePat = useMutation({
    mutationFn: () => unwrap(api.projects[':id'].pat.$delete({ param: { id: projectId } })),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.projects[':id'].$delete({ param: { id: projectId } })),
    onSuccess: () => {
      invalidate();
      void navigate({ to: '/' });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="戻る">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="text-base font-semibold">{project.name} の設定</h1>
      </div>

      <section className="grid gap-3">
        <Field label="表示名">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="既定のベースブランチ">
          <Input value={base} onChange={(e) => setBase(e.target.value)} />
        </Field>
        <Field label="GitHub リモート（owner/repo）">
          <Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="owner/repo" />
        </Field>
        <Field label="折りたたみ表示にするファイル（glob、1 行に 1 つ）">
          <Textarea
            rows={5}
            value={collapsed}
            onChange={(e) => setCollapsed(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="テストファイルの判定（glob、1 行に 1 つ）">
          <Textarea
            rows={3}
            value={tests}
            onChange={(e) => setTests(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            保存
          </Button>
        </div>
      </section>

      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-medium">
          <KeyRoundIcon className="size-4" />
          GitHub PAT（このプロジェクト専用）
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          fine-grained personal access token を、このリポジトリだけを対象に作成してください。必要な権限は
          <b> Contents: Read-only</b>、<b>Pull requests: Read-only</b>、<b>Metadata: Read-only</b>{' '}
          です。トークンは Keychain で暗号化して保存され、環境変数や gh の認証情報は使いません。
        </p>
        <Button
          variant="link"
          className="h-auto w-fit p-0 text-xs"
          onClick={() =>
            void api.open.url.$post({
              json: { url: 'https://github.com/settings/personal-access-tokens/new' },
            })
          }
        >
          GitHub で PAT を作成する
        </Button>
        {encryption.data && !encryption.data.available ? (
          <p className="text-xs text-destructive">
            Keychain による暗号化が使えないため、PAT を保存できません。
          </p>
        ) : (
          <>
            <p className="text-xs">{project.hasPat ? '✅ 設定済み' : '未設定'}</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                savePat.mutate();
              }}
            >
              <Input
                type="password"
                placeholder={project.hasPat ? '置き換える PAT' : 'github_pat_...'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={token.length < 10 || savePat.isPending || !project.githubRemote}
              >
                {savePat.isPending ? '確認中…' : '保存'}
              </Button>
              {project.hasPat && (
                <Button type="button" variant="outline" onClick={() => deletePat.mutate()}>
                  削除
                </Button>
              )}
            </form>
            {!project.githubRemote && (
              <p className="text-xs text-muted-foreground">先に GitHub リモートを設定してください。</p>
            )}
          </>
        )}
      </section>

      <section className="grid gap-2 rounded-lg border border-destructive/40 p-4">
        <h2 className="font-medium">プロジェクトの削除</h2>
        <p className="text-xs text-muted-foreground">
          TSugi が作った PR の worktree・ref とレビュー状態を削除します。clone 本体には触れません。
        </p>
        <div>
          <Button
            variant="destructive"
            onClick={() => window.confirm(`${project.name} を削除しますか？`) && remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2Icon />
            削除
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
