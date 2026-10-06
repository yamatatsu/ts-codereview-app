import { useMutation } from '@tanstack/react-query';
import { RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient, useSettings, useWorktrees } from '@/lib/queries';
import { formatBytes, relativeTime } from '@/lib/utils';

import type { DetectedExecutableDto } from '../../../shared/dto';
import type { ExecutablesSettings, Settings } from '../../../shared/settings';

const EXECUTABLES: { name: keyof ExecutablesSettings; label: string }[] = [
  { name: 'git', label: 'git（必須）' },
  { name: 'node', label: 'node' },
  { name: 'pnpm', label: 'pnpm' },
  { name: 'npm', label: 'npm' },
  { name: 'yarn', label: 'yarn' },
  { name: 'code', label: 'VS Code（code）' },
  { name: 'cursor', label: 'Cursor（cursor）' },
];

export function SettingsPage() {
  const settings = useSettings();
  if (!settings.data) return null;
  return <SettingsForm key={JSON.stringify(settings.data.executables)} settings={settings.data} />;
}

function SettingsForm({ settings: s }: { settings: Settings }) {
  const worktrees = useWorktrees(true);
  const [executables, setExecutables] = useState<ExecutablesSettings>(s.executables);
  const [detected, setDetected] = useState<DetectedExecutableDto[]>([]);

  const update = useMutation({
    mutationFn: (patch: Partial<Settings>) => unwrap(api.settings.$patch({ json: patch })),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.settings, data);
      toast.success('保存しました');
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const detect = useMutation({
    mutationFn: () => unwrap(api.settings.executables.detect.$post()),
    onSuccess: (result) => {
      setDetected(result);
      setExecutables((prev) => ({
        ...Object.fromEntries(result.filter((d) => d.path).map((d) => [d.name, d.path])),
        ...Object.fromEntries(Object.entries(prev).filter(([, v]) => v)),
      }));
    },
  });
  const removeWorktree = useMutation({
    mutationFn: (id: string) => unwrap(api.worktrees[':id'].$delete({ param: { id } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['worktrees'] }),
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-6 overflow-y-auto p-6">
      <h1 className="text-base font-semibold">設定</h1>

      <section className="grid gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">外部コマンドのパス</h2>
          <Button variant="outline" size="sm" onClick={() => detect.mutate()} disabled={detect.isPending}>
            <RefreshCwIcon />
            自動検出
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ログインシェルは実行せず、/opt/homebrew/bin・/usr/local/bin・~/.local/share/mise/shims
          などの決まった場所だけを探します。
        </p>
        {EXECUTABLES.map(({ name, label }) => {
          const found = detected.find((d) => d.name === name);
          return (
            <label key={name} className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                {label}
                {found?.version && <span className="ml-2 font-mono">{found.version}</span>}
              </span>
              <Input
                value={executables[name] ?? ''}
                placeholder="/absolute/path"
                className="font-mono text-xs"
                onChange={(e) => setExecutables((prev) => ({ ...prev, [name]: e.target.value || undefined }))}
              />
            </label>
          );
        })}
        <div>
          <Button
            onClick={() =>
              update.mutate({
                executables: Object.fromEntries(
                  Object.entries(executables).filter(([, v]) => v),
                ) as ExecutablesSettings,
                onboardingCompleted: true,
              })
            }
          >
            保存
          </Button>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border p-4">
        <h2 className="font-medium">表示</h2>
        <Row label="テーマ">
          <NativeSelect
            value={s.theme}
            onChange={(e) => update.mutate({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">システムに合わせる</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </NativeSelect>
        </Row>
        <Row label="diff の表示">
          <NativeSelect
            value={s.diffLayout}
            onChange={(e) => update.mutate({ diffLayout: e.target.value as Settings['diffLayout'] })}
          >
            <option value="split">split（左右）</option>
            <option value="unified">unified（上下）</option>
          </NativeSelect>
        </Row>
        <Row label="外部エディタ">
          <NativeSelect
            value={s.externalEditor}
            onChange={(e) => update.mutate({ externalEditor: e.target.value as Settings['externalEditor'] })}
          >
            <option value="code">VS Code</option>
            <option value="cursor">Cursor</option>
          </NativeSelect>
        </Row>
        <Row label="worktree の削除候補にするまでの日数">
          <Input
            type="number"
            className="w-24"
            defaultValue={s.worktreeStaleDays}
            onBlur={(e) => update.mutate({ worktreeStaleDays: Math.max(1, Number(e.target.value) || 14) })}
          />
        </Row>
      </section>

      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="font-medium">PR の worktree</h2>
        {worktrees.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">worktree はありません。</p>
        )}
        <ul className="grid gap-1">
          {(worktrees.data ?? []).map((wt) => (
            <li key={wt.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <div className="min-w-0 flex-1">
                <div>
                  {wt.projectName} #{wt.prNumber}
                  <span className="ml-2 text-xs text-muted-foreground">install: {wt.installStatus}</span>
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{wt.path}</div>
              </div>
              <span className="text-xs text-muted-foreground">
                {wt.sizeBytes !== null && formatBytes(wt.sizeBytes)} · {relativeTime(wt.lastOpenedAt)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="削除"
                onClick={() => removeWorktree.mutate(wt.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
