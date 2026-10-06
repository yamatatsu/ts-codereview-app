import { useCallback } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';

import { api, errorText, unwrap } from '@/lib/api';
import { useReviewStore, type Cursor } from '@/stores/review';

import type { LocationDto, TargetDto } from '../../../shared/dto';
import { locationFor } from './navigation';

type ReferencesState = {
  query: { path: string; line: number; symbol: string } | null;
  results: LocationDto[];
  loading: boolean;
};

export const useReferences = create<ReferencesState>(() => ({ query: null, results: [], loading: false }));

const targetApi = api.targets[':key'].lsp;

/** LSP の位置。lineNumber（1 始まり）と列（UTF-16）から作る */
export const lspPosition = (cursor: Cursor) => ({
  path: cursor.path,
  line: cursor.line - 1,
  character: cursor.character,
});

export const useLspActions = (target: TargetDto | undefined) => {
  const navigate = useReviewStore((s) => s.navigate);
  const setPeek = useReviewStore((s) => s.setPeek);
  const setContextTab = useReviewStore((s) => s.setContextTab);

  const toNav = useCallback(
    (loc: LocationDto) => locationFor(target?.files, loc.relativePath, loc.range.start.line + 1),
    [target?.files],
  );

  const definition = useCallback(
    async (cursor: Cursor | null, mode: 'jump' | 'peek' | 'type' = 'jump') => {
      if (!target || !cursor) return;
      if (cursor.side === 'base') {
        toast.info('削除側（base）のコードではジャンプできません');
        return;
      }
      try {
        const call = mode === 'type' ? targetApi['type-definition'] : targetApi.definition;
        const locations = await unwrap(call.$post({ param: { key: target.key }, json: lspPosition(cursor) }));
        const first = locations[0];
        if (!first) {
          toast.info('定義が見つかりませんでした');
          return;
        }
        if (mode === 'peek') setPeek(toNav(first));
        else if (locations.length > 1) {
          useReferences.setState({
            query: { path: cursor.path, line: cursor.line, symbol: '定義の候補' },
            results: locations,
            loading: false,
          });
          setContextTab('references');
          navigate(toNav(first));
        } else navigate(toNav(first));
      } catch (error) {
        toast.error(errorText(error));
      }
    },
    [target, navigate, setPeek, setContextTab, toNav],
  );

  const references = useCallback(
    async (cursor: Cursor | null, symbol = '') => {
      if (!target || !cursor || cursor.side === 'base') return;
      useReferences.setState({
        query: { path: cursor.path, line: cursor.line, symbol },
        results: [],
        loading: true,
      });
      setContextTab('references');
      try {
        const results = await unwrap(
          targetApi.references.$post({ param: { key: target.key }, json: lspPosition(cursor) }),
        );
        useReferences.setState({ results, loading: false });
      } catch (error) {
        useReferences.setState({ loading: false });
        toast.error(errorText(error));
      }
    },
    [target, setContextTab],
  );

  return { definition, references, toNav };
};
