import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReviewTarget } from '@tsugi/core';
import { toast } from 'sonner';

import { api, errorText, unwrap } from '@/lib/api';
import { qk, queryClient } from '@/lib/queries';

/** ReviewTarget を解決してレビュー画面を開く */
export const useOpenTarget = () => {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (target: ReviewTarget) => {
      const id = target.kind === 'pr' ? toast.loading(`PR #${target.number} を準備しています…`) : undefined;
      try {
        return await unwrap(api.targets.resolve.$post({ json: { target } }));
      } finally {
        if (id !== undefined) toast.dismiss(id);
      }
    },
    onSuccess: (dto) => {
      queryClient.setQueryData(qk.target(dto.key), dto);
      void navigate({ to: '/review/$targetKey', params: { targetKey: dto.key } });
    },
    onError: (error) => toast.error(errorText(error)),
  });
};
