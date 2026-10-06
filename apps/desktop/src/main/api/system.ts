import path from 'node:path';

import { Result } from '@praha/byethrow';
import { detectExecutables, pathDirsOf, spawnSafe } from '@tsugi/core';
import { BrowserWindow, dialog, shell } from 'electron';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import type { ServerEvent } from '../../shared/events';
import { settingsPatchSchema } from '../../shared/settings';
import { isEncryptionAvailable } from '../secrets';
import type { AppContext } from '../services/context';
import type { TargetService } from '../services/targets';
import { deleteWorktree, listWorktrees } from '../services/worktrees';
import { respond } from './respond';
import { validate } from './validate';

const ALLOWED_URL_HOSTS = new Set(['github.com', 'docs.github.com']);

export const systemRoutes = (ctx: AppContext, targets: TargetService) =>
  new Hono()
    .get('/settings', (c) => c.json(ctx.settings.get(), 200))
    .patch('/settings', validate('json', settingsPatchSchema), (c) => {
      const updated = ctx.settings.update(c.req.valid('json'));
      if (updated.executables.git) ctx.analysis.start(updated.executables.git);
      return c.json(updated, 200);
    })
    .post('/settings/executables/detect', async (c) => c.json(await detectExecutables(), 200))
    .get('/settings/encryption', (c) => c.json({ available: isEncryptionAvailable() }, 200))
    .get(
      '/worktrees',
      validate('query', z.object({ size: z.enum(['true', 'false']).default('false') })),
      async (c) => c.json(await listWorktrees(ctx, c.req.valid('query').size === 'true'), 200),
    )
    .delete('/worktrees/:id', async (c) => {
      const result = await deleteWorktree(ctx, targets, c.req.param('id'));
      return Result.isSuccess(result) ? c.json({ ok: true }, 200) : respond(c, result);
    })
    .post('/dialog/directory', async (c) => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'レビューするリポジトリを選択',
      });
      return c.json({ path: result.canceled ? null : (result.filePaths[0] ?? null) }, 200);
    })
    .post(
      '/open/editor',
      validate(
        'json',
        z.object({ key: z.string(), path: z.string(), line: z.number().int().min(1).default(1) }),
      ),
      async (c) => {
        const body = c.req.valid('json');
        const target = await targets.get(body.key);
        if (Result.isFailure(target)) return respond(c, target);
        const settings = ctx.settings.get();
        const editor = settings.executables[settings.externalEditor];
        if (!editor)
          return respond(
            c,
            Result.fail({ type: 'spawn.executableNotAllowed', executable: settings.externalEditor }),
          );
        const abs = path.isAbsolute(body.path) ? body.path : path.join(target.value.workspacePath, body.path);
        const result = await spawnSafe(editor, ['--goto', `${abs}:${body.line}`], {
          cwd: target.value.workspacePath,
          pathDirs: pathDirsOf(settings.executables),
          timeoutMs: 15_000,
        });
        return Result.isSuccess(result) ? c.json({ ok: true }, 200) : respond(c, result);
      },
    )
    .post('/open/url', validate('json', z.object({ url: z.string().url() })), async (c) => {
      const url = new URL(c.req.valid('json').url);
      if (url.protocol !== 'https:' || !ALLOWED_URL_HOSTS.has(url.hostname))
        return respond(c, Result.fail({ type: 'validation.invalid', message: '許可されていない URL です' }));
      await shell.openExternal(url.href);
      return c.json({ ok: true }, 200);
    })
    .post(
      '/find',
      validate(
        'json',
        z.object({ text: z.string(), forward: z.boolean().default(true), stop: z.boolean().default(false) }),
      ),
      (c) => {
        const body = c.req.valid('json');
        const contents =
          BrowserWindow.getFocusedWindow()?.webContents ?? BrowserWindow.getAllWindows()[0]?.webContents;
        if (!contents) return c.json({ ok: false }, 200);
        if (body.stop || !body.text) contents.stopFindInPage('clearSelection');
        else contents.findInPage(body.text, { forward: body.forward, findNext: true });
        return c.json({ ok: true }, 200);
      },
    )
    .post('/logs', validate('json', z.object({ message: z.string(), stack: z.string().optional() })), (c) => {
      const body = c.req.valid('json');
      ctx.logger.error(`[renderer] ${body.message}`, body.stack ? { stack: body.stack } : undefined);
      return c.json({ ok: true }, 200);
    })
    .get('/events', (c) =>
      streamSSE(c, async (stream) => {
        const queue: ServerEvent[] = [];
        let wake: (() => void) | undefined;
        const unsubscribe = ctx.bus.subscribe((event) => {
          queue.push(event);
          wake?.();
        });
        stream.onAbort(() => {
          unsubscribe();
          wake?.();
        });
        await stream.writeSSE({ event: 'ready', data: '{}' });
        while (!stream.aborted) {
          const next = queue.shift();
          if (next) {
            await stream.writeSSE({ data: JSON.stringify(next) });
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, 15_000);
          });
          wake = undefined;
          if (queue.length === 0 && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '{}' });
        }
        unsubscribe();
      }),
    );
