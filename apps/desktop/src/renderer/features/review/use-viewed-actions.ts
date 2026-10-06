import { useCallback } from 'react';
import { toast } from 'sonner';

import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient } from '@/lib/queries';

const viewedApi = api.targets[':key'].viewed;

export const useToggleViewed = (targetKey: string) =>
  useCallback(
    async (path: string, currentlyViewed: boolean) => {
      try {
        const result = currentlyViewed
          ? await unwrap(viewedApi.$delete({ param: { key: targetKey }, query: { path } }))
          : await unwrap(viewedApi.$put({ param: { key: targetKey }, json: { path } }));
        queryClient.setQueryData(qk.viewed(targetKey), result);
        void queryClient.invalidateQueries({ queryKey: ['target', targetKey, 'analysis', 'graph'] });
      } catch (error) {
        toast.error(errorText(error));
      }
    },
    [targetKey],
  );
