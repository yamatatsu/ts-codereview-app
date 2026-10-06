import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppContext } from '../services/context';
import type { TargetService } from '../services/targets';
import { projectRoutes } from './projects';
import { systemRoutes } from './system';
import { targetRoutes } from './targets';

export const APP_ORIGIN = 'app://tsugi';

/** `app://tsugi/api/*` で提供する内部 API（docs/adr/0008） */
export const createApi = (ctx: AppContext, targets: TargetService, devOrigin: string | null) => {
  const app = new Hono().basePath('/api');
  if (devOrigin) {
    // 開発時のみ、Vite の dev server からのアクセスを許可する
    app.use('*', cors({ origin: devOrigin, allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
  }
  app.onError((error, c) => {
    ctx.logger.error('api error', { path: c.req.path, message: error.message, stack: error.stack });
    return c.json({ error: { type: 'analysis.failed', message: error.message } }, 500);
  });
  return app
    .route('/projects', projectRoutes(ctx, targets))
    .route('/targets', targetRoutes(ctx, targets))
    .route('/', systemRoutes(ctx, targets));
};

export type AppType = ReturnType<typeof createApi>;
