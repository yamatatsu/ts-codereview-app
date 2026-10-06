import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { buildKeyIndex, chordOf, DEFAULT_KEYBINDINGS, shouldIgnore, type CommandId } from '@/keymap/keymap';
import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient, useSettings } from '@/lib/queries';
import { useReviewStore } from '@/stores/review';

import type { TargetDto } from '../../../shared/dto';
import { jumpHunk, locationFor } from './navigation';
import { useLspActions } from './use-lsp-actions';
import type { ReviewData } from './use-review-data';
import { useToggleViewed } from './use-viewed-actions';

/** コマンド ID の実装とキーボードショートカットの登録 */
export const useReviewCommands = (
  target: TargetDto | undefined,
  data: ReviewData,
  refs: {
    container: React.RefObject<HTMLDivElement | null>;
    scroller: React.RefObject<HTMLDivElement | null>;
  },
) => {
  const routerNavigate = useNavigate();
  const store = useReviewStore;
  const { definition, references } = useLspActions(target);
  const toggleViewed = useToggleViewed(target?.key ?? '');
  const settings = useSettings();
  const keyIndex = useMemo(() => buildKeyIndex(DEFAULT_KEYBINDINGS), []);

  const run = useCallback(
    (command: CommandId) => {
      const s = store.getState();
      const sequence = data.groups.sequence;
      const currentIndex = sequence.findIndex((f) => f.path === s.location?.path);
      switch (command) {
        case 'workbench.quickOpen':
          return s.setQuickOpen(true);
        case 'workbench.commandPalette':
          return s.setPalette(true);
        case 'nav.goToDefinition':
          return void definition(s.cursor);
        case 'nav.goToTypeDefinition':
          return void definition(s.cursor, 'type');
        case 'nav.peekDefinition':
          return void definition(s.cursor, 'peek');
        case 'nav.findReferences':
          return void references(s.cursor);
        case 'nav.back':
          return s.goBack();
        case 'nav.forward':
          return s.goForward();
        case 'diff.nextChange':
          return jumpHunk(refs.container.current, refs.scroller.current, 1);
        case 'diff.prevChange':
          return jumpHunk(refs.container.current, refs.scroller.current, -1);
        case 'files.next': {
          const next = sequence[currentIndex + 1] ?? sequence[0];
          if (next) s.navigate({ path: next.path, view: 'diff' });
          return;
        }
        case 'files.prev': {
          const prev = sequence[currentIndex - 1] ?? sequence.at(-1);
          if (prev) s.navigate({ path: prev.path, view: 'diff' });
          return;
        }
        case 'files.nextUnviewed': {
          const ordered = [
            ...sequence.slice(currentIndex + 1),
            ...sequence.slice(0, Math.max(0, currentIndex + 1)),
          ];
          const next = ordered.find((f) => data.viewedByPath.get(f.path)?.state !== 'viewed');
          if (next) s.navigate({ path: next.path, view: 'diff' });
          else toast.success('すべてのファイルを Viewed にしました 🎉');
          return;
        }
        case 'outline.show':
          return s.setContextTab('outline');
        case 'test.toggle': {
          const path = s.location?.path;
          if (!path) return;
          const asImpl = data.linksByImpl.get(path) ?? [];
          const asTest = data.linksByTest.get(path) ?? [];
          const candidates =
            asTest.length > 0
              ? asTest.map((l) => ({ ...l, other: l.implPath }))
              : asImpl.map((l) => ({ ...l, other: l.testPath }));
          const primary = candidates.filter((c) => c.strength === 'primary');
          const pick = primary.length > 0 ? primary : candidates;
          if (pick.length === 1 && pick[0]) s.navigate(locationFor(target?.files, pick[0].other));
          else if (pick.length > 1) s.setContextTab('tests');
          else toast.info('対応するテスト／実装が見つかりません');
          return;
        }
        case 'review.toggleViewed': {
          const path = s.location?.path;
          if (!path || !target?.files.some((f) => f.path === path)) return;
          void toggleViewed(path, data.viewedByPath.get(path)?.state === 'viewed');
          return;
        }
        case 'view.toggleSidebar':
          return s.toggleSidebar();
        case 'view.togglePanel':
          return s.togglePanel();
        case 'graph.open':
          if (target)
            void routerNavigate({ to: '/review/$targetKey/graph', params: { targetKey: target.key } });
          return;
        case 'diff.toggleLayout': {
          const next = settings.data?.diffLayout === 'unified' ? 'split' : 'unified';
          void unwrap(api.settings.$patch({ json: { diffLayout: next } })).then((d) =>
            queryClient.setQueryData(qk.settings, d),
          );
          return;
        }
        case 'diff.toggleSinceViewed':
          return s.setSinceViewed(!s.sinceViewed);
        case 'note.add': {
          const line = s.cursor?.path === s.location?.path ? s.cursor?.line : s.location?.line;
          if (s.location && s.location.view === 'diff')
            s.setNoteDraft({ path: s.location.path, line: line ?? 1 });
          return;
        }
        case 'editor.openExternal': {
          if (!target || !s.location) return;
          void unwrap(
            api.open.editor.$post({
              json: { key: target.key, path: s.location.path, line: s.cursor?.line ?? s.location.line ?? 1 },
            }),
          ).catch((e: unknown) => toast.error(errorText(e)));
          return;
        }
        case 'search.find':
          return s.setFindOpen(true);
        case 'review.refresh':
          if (target) {
            void unwrap(api.targets[':key'].refresh.$post({ param: { key: target.key } }))
              .then((dto) => {
                queryClient.setQueryData(qk.target(target.key), dto);
                void queryClient.invalidateQueries({ queryKey: ['target', target.key] });
              })
              .catch((e: unknown) => toast.error(errorText(e)));
          }
          return;
      }
    },
    [data, target, definition, references, toggleViewed, refs, routerNavigate, settings.data, store],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const s = store.getState();
        if (s.peek) s.setPeek(null);
        return;
      }
      if (shouldIgnore(event)) return;
      const command = keyIndex.get(chordOf(event));
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      run(command);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [keyIndex, run, store]);

  return run;
};
