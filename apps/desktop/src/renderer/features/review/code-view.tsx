import { File } from '@pierre/diffs/react';
import { useEffect, useMemo } from 'react';

import { errorText } from '@/lib/api';
import { useWorkspaceFile } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import { cancelHover, scheduleHover } from './hover-card';
import { scrollToLine } from './navigation';
import { useDiffTheme } from './use-diff-theme';
import { useLspActions } from './use-lsp-actions';

/** 変更されていないファイル（ジャンプ先や node_modules の .d.ts）を全文表示する */
export function CodeView({
  target,
  path,
  line,
  containerRef,
  compact = false,
}: {
  target: TargetDto;
  path: string;
  line: number | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  compact?: boolean;
}) {
  const file = useWorkspaceFile(target.key, path);
  const setCursor = useReviewStore((s) => s.setCursor);
  const flash = useReviewStore((s) => s.flash);
  const { theme, themeType } = useDiffTheme();
  const { definition } = useLspActions(target);
  // LSP には実パス（外部ファイルは絶対パス）を渡す
  const lspPath = file.data?.external ? file.data.path : path;

  const contents = useMemo(
    () =>
      file.data
        ? {
            name: file.data.relativePath,
            contents: file.data.contents,
            cacheKey: `fs:${file.data.path}:${file.data.contents.length}`,
          }
        : null,
    [file.data],
  );

  useEffect(() => {
    if (!line || !contents) return;
    let tries = 0;
    const tick = () => {
      if (scrollToLine(containerRef.current, line, flash?.path === path) || tries++ > 20) return;
      setTimeout(tick, 100);
    };
    tick();
  }, [line, contents, flash, path, containerRef]);

  if (file.isLoading) return <p className="p-6 text-muted-foreground">読み込み中…</p>;
  if (file.error) return <p className="p-6 text-destructive">{errorText(file.error)}</p>;
  if (!contents) return null;

  return (
    <File
      file={contents}
      className={compact ? 'block max-h-80 overflow-auto' : 'block'}
      selectedLines={line ? { start: line, end: line } : null}
      options={{
        theme,
        themeType,
        overflow: 'scroll',
        disableFileHeader: true,
        lineHoverHighlight: 'both',
        onTokenEnter: (props) =>
          scheduleHover(
            target.key,
            { path: lspPath, line: props.lineNumber, character: props.lineCharStart, side: 'head' },
            props.tokenElement,
          ),
        onTokenLeave: () => cancelHover(),
        onTokenClick: (props, event) => {
          const cursor = {
            path: lspPath,
            line: props.lineNumber,
            character: props.lineCharStart,
            side: 'head' as const,
          };
          setCursor(cursor);
          if (event.metaKey) void definition(cursor);
        },
      }}
    />
  );
}
