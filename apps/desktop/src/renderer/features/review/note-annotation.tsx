import { useMutation } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

import type { NoteDto } from '../../../shared/dto';

export type NoteMeta = { kind: 'note'; note: NoteDto } | { kind: 'draft'; path: string; line: number };

const notesApi = api.targets[':key'].notes;

export function NoteAnnotation({ targetKey, meta }: { targetKey: string; meta: NoteMeta }) {
  const setDraft = useReviewStore((s) => s.setNoteDraft);
  const [editing, setEditing] = useState(meta.kind === 'draft');
  const [body, setBody] = useState(meta.kind === 'note' ? meta.note.body : '');
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.notes(targetKey) });

  const save = useMutation({
    mutationFn: async () => {
      if (meta.kind === 'draft') {
        await unwrap(
          notesApi.$post({
            param: { key: targetKey },
            json: { path: meta.path, startLine: meta.line, endLine: meta.line, body },
          }),
        );
        setDraft(null);
      } else {
        await unwrap(notesApi[':id'].$patch({ param: { key: targetKey, id: meta.note.id }, json: { body } }));
        setEditing(false);
      }
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: () =>
      meta.kind === 'note'
        ? unwrap(notesApi[':id'].$delete({ param: { key: targetKey, id: meta.note.id } }))
        : Promise.resolve(null),
    onSuccess: invalidate,
  });

  return (
    <div
      className="m-2 max-w-3xl rounded-md border border-primary/30 bg-card p-2 font-sans text-[13px] whitespace-normal shadow-sm"
      data-selectable
    >
      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) save.mutate();
          }}
        >
          <Textarea
            autoFocus
            rows={3}
            value={body}
            placeholder="自分用のメモ（Markdown、GitHub には送られません）"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (body.trim()) save.mutate();
              }
              if (e.key === 'Escape') {
                if (meta.kind === 'draft') setDraft(null);
                else setEditing(false);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (meta.kind === 'draft' ? setDraft(null) : setEditing(false))}
            >
              キャンセル
            </Button>
            <Button type="submit" size="sm" disabled={!body.trim() || save.isPending}>
              保存（⌘↩）
            </Button>
          </div>
        </form>
      ) : meta.kind === 'note' ? (
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left [&_p]:my-0.5"
            onClick={() => setEditing(true)}
          >
            {meta.note.stale && <span className="mr-1 text-[11px] text-renamed">（古いメモ）</span>}
            <Markdown>{meta.note.body}</Markdown>
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="メモを削除" onClick={() => remove.mutate()}>
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
