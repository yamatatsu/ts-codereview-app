import { Result } from '@praha/byethrow';
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppContext } from '../services/context';
import {
  deletePat,
  getProject,
  listBranches,
  listProjects,
  registerProject,
  savePat,
  updateProject,
} from '../services/projects';
import type { TargetService } from '../services/targets';
import { deleteWorktree, listPulls } from '../services/worktrees';
import { respond } from './respond';
import { validate } from './validate';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  defaultBaseBranch: z.string().min(1).optional(),
  githubRemote: z.string().nullable().optional(),
  collapsedGlobs: z.array(z.string()).optional(),
  testGlobs: z.array(z.string()).optional(),
});

export const projectRoutes = (ctx: AppContext, targets: TargetService) =>
  new Hono()
    .get('/', async (c) => c.json(await listProjects(ctx), 200))
    .post('/', validate('json', z.object({ rootPath: z.string().min(1) })), async (c) =>
      respond(c, await registerProject(ctx, c.req.valid('json').rootPath)),
    )
    .patch('/:id', validate('json', patchSchema), async (c) => {
      const body = c.req.valid('json');
      const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      return respond(c, await updateProject(ctx, c.req.param('id'), patch));
    })
    .delete('/:id', async (c) => {
      const id = c.req.param('id');
      const project = await getProject(ctx, id);
      if (Result.isFailure(project)) return respond(c, project);
      for (const wt of await ctx.repos.prWorktrees.listByProject(id))
        await deleteWorktree(ctx, targets, wt.id);
      await ctx.lsp.stop(project.value.rootPath);
      await ctx.analysis.request('workspace.close', { workspace: project.value.rootPath }).catch(() => null);
      await ctx.repos.projects.delete(id);
      return c.json({ ok: true }, 200);
    })
    .put('/:id/pat', validate('json', z.object({ token: z.string().min(10) })), async (c) =>
      respond(c, await savePat(ctx, c.req.param('id'), c.req.valid('json').token)),
    )
    .delete('/:id/pat', async (c) => respond(c, await deletePat(ctx, c.req.param('id'))))
    .get('/:id/branches', async (c) => respond(c, await listBranches(ctx, c.req.param('id'))))
    .get('/:id/pulls', async (c) => respond(c, await listPulls(ctx, targets, c.req.param('id'))));
