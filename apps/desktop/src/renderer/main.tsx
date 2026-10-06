import './styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { api } from './lib/api';
import { queryClient, startEventBridge } from './lib/queries';
import { router } from './routes/router';

startEventBridge();

// renderer のエラーは main のログに送る（docs/adr/0019）
const report = (message: string, stack?: string) =>
  void api.logs.$post({ json: stack ? { message, stack } : { message } }).catch(() => undefined);
window.addEventListener('error', (e) =>
  report(e.message, e.error instanceof Error ? e.error.stack : undefined),
);
window.addEventListener('unhandledrejection', (e) =>
  report(String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined),
);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
