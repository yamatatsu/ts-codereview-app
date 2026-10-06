import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { protocol } from 'electron';

/** app.whenReady() の前に呼ぶ */
export const registerAppScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

/**
 * `app://tsugi/api/*` は Hono、それ以外は本番ビルドの renderer の静的ファイル。
 * TCP ポートは開けない（docs/adr/0008）。
 */
export const handleAppProtocol = (
  api: { fetch: (req: Request) => Response | Promise<Response> },
  rendererDir: string | null,
): void => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'tsugi') return new Response('not found', { status: 404 });
    if (url.pathname.startsWith('/api/')) return api.fetch(request);
    if (!rendererDir) return new Response('not found', { status: 404 });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.normalize(path.join(rendererDir, relative));
    if (!file.startsWith(rendererDir)) return new Response('forbidden', { status: 403 });
    try {
      const body = await readFile(file);
      const headers: Record<string, string> = {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      };
      if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
      return new Response(body, { headers });
    } catch {
      // SPA のため、存在しないパスは index.html を返す
      const body = await readFile(path.join(rendererDir, 'index.html'));
      return new Response(body, {
        headers: { 'content-type': MIME['.html'] as string, 'content-security-policy': CSP },
      });
    }
  });
};
