import type { DiffLineAnnotation, FileContents } from '@pierre/diffs/react';
import { MultiFileDiff } from '@pierre/diffs/react';
import type { ChangedFile } from '@tsugi/core';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { errorText } from '@/lib/api';
import { useBlobBySha, useBlobs, useNotes } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import { cancelHover, scheduleHover } from './hover-card';
import { scrollToLine } from './navigation';
import { NoteAnnotation, type NoteMeta } from './note-annotation';
import { useDiffTheme } from './use-diff-theme';
import { useLspActions } from './use-lsp-actions';

const LARGE_DIFF_LINES = 5000;

export function DiffView({
  target,
  file,
  viewedBlob,
  containerRef,
}: {
  target: TargetDto;
  file: ChangedFile;
  viewedBlob: string | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const blobs = useBlobs(target.key, file.path);
  const sinceViewed =
    useReviewStore((s) => s.sinceViewed) && viewedBlob !== undefined && !viewedBlob.startsWith('deleted:');
  const previous = useBlobBySha(target.key, sinceViewed ? viewedBlob : undefined);
  const notes = useNotes(target.key);
  const draft = useReviewStore((s) => s.noteDraft);
  const setDraft = useReviewStore((s) => s.setNoteDraft);
  const setCursor = useReviewStore((s) => s.setCursor);
  const location = useReviewStore((s) => s.location);
  const flash = useReviewStore((s) => s.flash);
  const { theme, themeType, layout } = useDiffTheme();
  const { definition } = useLspActions(target);
  const [forceLarge, setForceLarge] = useState(false);

  const data = blobs.data;
  const oldFile: FileContents | null = useMemo(() => {
    if (sinceViewed && previous.data !== undefined)
      return { name: file.path, contents: previous.data, cacheKey: `blob:${viewedBlob}` };
    if (!data?.base) return null;
    return {
      name: data.base.name,
      contents: data.base.contents,
      cacheKey: `blob:${file.baseBlob ?? data.base.name}`,
    };
  }, [data, sinceViewed, previous.data, file, viewedBlob]);
  const newFile: FileContents | null = useMemo(
    () =>
      data?.head
        ? {
            name: data.head.name,
            contents: data.head.contents,
            cacheKey: `blob:${file.headBlob ?? 'wt'}:${data.head.contents.length}`,
          }
        : null,
    [data, file.headBlob],
  );

  const annotations = useMemo(() => {
    const list: DiffLineAnnotation<NoteMeta>[] = (notes.data ?? [])
      .filter((n) => n.path === file.path)
      .map((note) => ({ side: 'additions', lineNumber: note.endLine, metadata: { kind: 'note', note } }));
    if (draft?.path === file.path)
      list.push({ side: 'additions', lineNumber: draft.line, metadata: { kind: 'draft', ...draft } });
    return list;
  }, [notes.data, draft, file.path]);

  // ジャンプ先の行へスクロールする（描画が非同期なので数回リトライする）
  useEffect(() => {
    if (!location?.line || location.path !== file.path) return;
    let tries = 0;
    const tick = () => {
      if (scrollToLine(containerRef.current, location.line ?? 1, flash?.path === file.path) || tries++ > 20)
        return;
      setTimeout(tick, 100);
    };
    tick();
  }, [location, flash, file.path, containerRef, newFile]);

  if (blobs.isLoading) return <p className="p-6 text-muted-foreground">読み込み中…</p>;
  if (blobs.error) return <p className="p-6 text-destructive">{errorText(blobs.error)}</p>;
  if (!data) return null;
  if (data.binary) return <p className="p-6 text-muted-foreground">バイナリファイルのため表示しません。</p>;
  if (!oldFile && !newFile) return <p className="p-6 text-muted-foreground">内容がありません。</p>;

  const lineCount = Math.max(
    oldFile?.contents.split('\n').length ?? 0,
    newFile?.contents.split('\n').length ?? 0,
  );
  if (lineCount > LARGE_DIFF_LINES && !forceLarge) {
    return (
      <div className="flex flex-col items-start gap-2 p-6 text-muted-foreground">
        大きなファイル（{lineCount.toLocaleString()} 行）のため折りたたんでいます。
        <Button variant="outline" size="sm" onClick={() => setForceLarge(true)}>
          展開する
        </Button>
      </div>
    );
  }

  const input =
    oldFile && newFile
      ? { oldFile, newFile }
      : oldFile
        ? { oldFile, newFile: null }
        : { oldFile: null, newFile: newFile as FileContents };

  return (
    <MultiFileDiff<NoteMeta>
      {...input}
      className="block"
      lineAnnotations={annotations}
      renderAnnotation={(a) =>
        a.metadata ? <NoteAnnotation targetKey={target.key} meta={a.metadata} /> : null
      }
      options={{
        theme,
        themeType,
        diffStyle: layout,
        lineDiffType: 'word-alt',
        overflow: 'scroll',
        disableFileHeader: true,
        hunkSeparators: 'line-info',
        expansionLineCount: 20,
        enableGutterUtility: true,
        lineHoverHighlight: 'both',
        onGutterUtilityClick: (range) => {
          if (range.side !== 'deletions') setDraft({ path: file.path, line: range.end });
        },
        onTokenEnter: (props) => {
          const side = props.side === 'deletions' ? 'base' : 'head';
          scheduleHover(
            target.key,
            { path: file.path, line: props.lineNumber, character: props.lineCharStart, side },
            props.tokenElement,
          );
        },
        onTokenLeave: () => cancelHover(),
        onTokenClick: (props, event) => {
          const cursor = {
            path: file.path,
            line: props.lineNumber,
            character: props.lineCharStart,
            side: props.side === 'deletions' ? ('base' as const) : ('head' as const),
          };
          setCursor(cursor);
          if (event.metaKey) void definition(cursor);
        },
      }}
    />
  );
}
