import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import {
  createMatcher,
  diffLines,
  EXTERNAL_PREFIX,
  extractTestOutline,
  intersectsLines,
  isExternalNode,
  remapNote,
  targetLocalKey,
  viewedBlobOf,
  type AppError,
  type CodeLocation,
  type DiffedEdge,
  type LspError,
} from '@tsugi/core';
import { Hono } from 'hono';
import { z } from 'zod';

import type { GraphDto, GraphNodeDto, LocationDto, NoteDto, TargetDto } from '../../shared/dto';
import type { AppContext } from '../services/context';
import { readFileWithin } from '../services/files';
import type { TargetService } from '../services/targets';
import { respond } from './respond';
import { validate } from './validate';

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local-worktree'), projectId: z.string() }),
  z.object({
    kind: z.literal('local-branch'),
    projectId: z.string(),
    branch: z.string(),
    baseBranch: z.string(),
  }),
  z.object({ kind: z.literal('pr'), projectId: z.string(), number: z.number().int().positive() }),
]);

const positionSchema = z.object({
  path: z.string(),
  line: z.number().int().min(0),
  character: z.number().int().min(0),
});
const pathQuery = z.object({ path: z.string().min(1) });

const lineAt = async (absPath: string, line: number): Promise<string> => {
  try {
    return ((await readFile(absPath, 'utf8')).split('\n')[line] ?? '').trim().slice(0, 200);
  } catch {
    return '';
  }
};

const toLocationDtos = async (dto: TargetDto, locations: CodeLocation[]): Promise<LocationDto[]> => {
  // LSP は実パスを返すことがあるので、シンボリックリンクを解決したルートとも比べる
  const realRoot = await realpath(dto.workspacePath).catch(() => dto.workspacePath);
  return Promise.all(
    locations.map(async (loc) => {
      const root = loc.absPath.startsWith(realRoot + path.sep) ? realRoot : dto.workspacePath;
      const relative = path.relative(root, loc.absPath);
      const external = relative.startsWith('..') || relative.split(path.sep).includes('node_modules');
      return {
        ...loc,
        relativePath: external ? loc.absPath : relative.split(path.sep).join('/'),
        external,
        preview: await lineAt(loc.absPath, loc.range.start.line),
      };
    }),
  );
};

/** head 側で変更された行（1 始まり） */
const changedHeadLines = (base: string | null, head: string): Set<number> => {
  const lines = new Set<number>();
  if (base === null) {
    head.split('\n').forEach((_, i) => lines.add(i + 1));
    return lines;
  }
  let headLine = 1;
  for (const op of diffLines(base.split('\n'), head.split('\n'))) {
    if (op === 'insert') lines.add(headLine);
    if (op !== 'delete') headLine += 1;
  }
  return lines;
};

export const targetRoutes = (ctx: AppContext, targets: TargetService) => {
  const withTarget = async (key: string) => targets.get(key);

  const lspCall = async (
    key: string,
    body: z.infer<typeof positionSchema>,
    method: 'definition' | 'typeDefinition' | 'references',
  ): Result.ResultAsync<LocationDto[], AppError> => {
    const target = await withTarget(key);
    if (Result.isFailure(target)) return target;
    const session = await ctx.lsp.get(target.value.workspacePath);
    const absPath = path.isAbsolute(body.path) ? body.path : path.join(target.value.workspacePath, body.path);
    const result: Result.Result<CodeLocation[], LspError> = await session[method](absPath, {
      line: body.line,
      character: body.character,
    });
    if (Result.isFailure(result)) return result;
    return Result.succeed(await toLocationDtos(target.value, result.value));
  };

  return new Hono()
    .post('/resolve', validate('json', z.object({ target: targetSchema })), async (c) =>
      respond(c, await targets.resolve(c.req.valid('json').target)),
    )
    .get('/:key', async (c) => respond(c, await withTarget(c.req.param('key'))))
    .post('/:key/refresh', async (c) => {
      const key = c.req.param('key');
      const current = await withTarget(key);
      if (Result.isFailure(current)) return respond(c, current);
      targets.invalidate(key);
      return respond(c, await targets.resolve(current.value.target));
    })
    .get('/:key/blobs', validate('query', pathQuery), async (c) =>
      respond(c, await targets.blobs(c.req.param('key'), c.req.valid('query').path)),
    )
    .get('/:key/blob/:sha', async (c) =>
      respond(c, await targets.blobBySha(c.req.param('key'), c.req.param('sha'))),
    )
    .get('/:key/fs', validate('query', pathQuery), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      const roots = [target.value.workspacePath];
      const project = await ctx.repos.projects.get(target.value.target.projectId);
      if (project) roots.push(project.rootPath);
      const file = await readFileWithin(roots, c.req.valid('query').path);
      if (Result.isFailure(file)) return respond(c, file);
      const relative = path.relative(target.value.workspacePath, file.value.absPath);
      const external = relative.startsWith('..') || relative.split(path.sep).includes('node_modules');
      return c.json(
        {
          path: file.value.absPath,
          relativePath: external ? file.value.absPath : relative.split(path.sep).join('/'),
          contents: file.value.buffer.toString('utf8'),
          external,
        },
        200,
      );
    })
    .post('/:key/lsp/definition', validate('json', positionSchema), async (c) =>
      respond(c, await lspCall(c.req.param('key'), c.req.valid('json'), 'definition')),
    )
    .post('/:key/lsp/type-definition', validate('json', positionSchema), async (c) =>
      respond(c, await lspCall(c.req.param('key'), c.req.valid('json'), 'typeDefinition')),
    )
    .post('/:key/lsp/references', validate('json', positionSchema), async (c) =>
      respond(c, await lspCall(c.req.param('key'), c.req.valid('json'), 'references')),
    )
    .post('/:key/lsp/hover', validate('json', positionSchema), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      const body = c.req.valid('json');
      const session = await ctx.lsp.get(target.value.workspacePath);
      const absPath = path.isAbsolute(body.path)
        ? body.path
        : path.join(target.value.workspacePath, body.path);
      return respond(c, await session.hover(absPath, { line: body.line, character: body.character }));
    })
    .get('/:key/lsp/symbols', validate('query', pathQuery), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      const session = await ctx.lsp.get(target.value.workspacePath);
      const file = c.req.valid('query').path;
      return respond(
        c,
        await session.documentSymbols(
          path.isAbsolute(file) ? file : path.join(target.value.workspacePath, file),
        ),
      );
    })
    .get('/:key/lsp/status', async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      return c.json(ctx.lsp.status(target.value.workspacePath), 200);
    })
    .get(
      '/:key/graph',
      validate(
        'query',
        z.object({
          hops: z.coerce.number().int().min(0).max(3).default(1),
          tests: z.enum(['true', 'false']).default('true'),
          typeOnly: z.enum(['true', 'false']).default('true'),
          external: z.enum(['true', 'false']).default('false'),
        }),
      ),
      async (c) => {
        const target = await withTarget(c.req.param('key'));
        if (Result.isFailure(target)) return respond(c, target);
        const q = c.req.valid('query');
        const dto = target.value;
        const includeExternal = q.external === 'true';
        const includeTypeOnly = q.typeOnly === 'true';
        const seeds = dto.files
          .filter((f) => f.status !== 'D' && f.kind !== 'collapsed' && f.kind !== 'other')
          .map((f) => f.path);
        const [hood, diff, viewed] = await Promise.all([
          ctx.analysis.request('graph.neighborhood', {
            workspace: dto.workspacePath,
            seeds,
            hops: q.hops,
            includeExternal,
            includeTypeOnly,
          }),
          ctx.analysis.request('graph.diff', {
            workspace: dto.workspacePath,
            repoPath: dto.workspacePath,
            baseRev: dto.baseRev,
            files: dto.files.filter((f) => f.kind === 'impl' || f.kind === 'test'),
          }),
          targets.viewed(dto.key),
        ]);
        const project = await ctx.repos.projects.get(dto.target.projectId);
        const isTest = createMatcher(project?.testGlobs ?? []);
        const changedByPath = new Map(dto.files.map((f) => [f.path, f]));
        const viewedSet = new Set(
          Result.isSuccess(viewed)
            ? viewed.value.states.filter((s) => s.state === 'viewed').map((s) => s.path)
            : [],
        );
        const accept = (id: string) =>
          (includeExternal || !isExternalNode(id)) &&
          (q.tests === 'true' || !isTest(id) || changedByPath.has(id));

        const nodeIds = new Set(hood.files.filter(accept));
        for (const f of dto.files)
          if (f.status === 'D' && (f.kind === 'impl' || f.kind === 'test') && accept(f.path))
            nodeIds.add(f.path);
        const diffByKey = new Map(diff.edges.map((e) => [`${e.from}\0${e.to}`, e]));
        const edges: DiffedEdge[] = hood.edges
          .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
          .map((e) => ({ ...e, change: diffByKey.get(`${e.from}\0${e.to}`)?.change ?? 'unchanged' }));
        for (const e of diff.edges) {
          if (e.change !== 'removed' || !accept(e.to) || !accept(e.from)) continue;
          if (!includeTypeOnly && e.kind === 'type-only') continue;
          nodeIds.add(e.from);
          nodeIds.add(e.to);
          edges.push(e);
        }
        const nodes: GraphNodeDto[] = [...nodeIds].map((id) => {
          const changed = changedByPath.get(id);
          return {
            id,
            label: id.startsWith(EXTERNAL_PREFIX) ? id.slice(EXTERNAL_PREFIX.length) : id,
            external: isExternalNode(id),
            changed: changed?.status ?? null,
            kind: changed?.kind ?? (isTest(id) ? 'test' : 'unchanged'),
            viewed: viewedSet.has(id),
          };
        });
        const graph: GraphDto = { nodes, edges, ready: hood.ready && diff.ready };
        return c.json(graph, 200);
      },
    )
    .get('/:key/relations', validate('query', pathQuery), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      const rel = await ctx.analysis.request('graph.relations', {
        workspace: target.value.workspacePath,
        path: c.req.valid('query').path,
      });
      return c.json(
        {
          imports: rel.imports.map((e) => ({ path: e.to, kind: e.kind, external: isExternalNode(e.to) })),
          importedBy: rel.importedBy.map((e) => ({ path: e.from, kind: e.kind })),
          ready: rel.ready,
        },
        200,
      );
    })
    .get('/:key/review-order', async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      return c.json(
        await ctx.analysis.request('reviewOrder', {
          workspace: target.value.workspacePath,
          files: target.value.files,
        }),
      );
    })
    .get('/:key/test-links', async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      return c.json(await ctx.analysis.request('testLinks', { workspace: target.value.workspacePath }), 200);
    })
    .get('/:key/files', async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      return c.json(await ctx.analysis.request('files.list', { workspace: target.value.workspacePath }), 200);
    })
    .get('/:key/test-outline', validate('query', pathQuery), async (c) => {
      const key = c.req.param('key');
      const file = c.req.valid('query').path;
      const target = await withTarget(key);
      if (Result.isFailure(target)) return respond(c, target);
      const changed = target.value.files.find((f) => f.path === file);
      let head: string;
      let base: string | null = null;
      if (changed) {
        const blobs = await targets.blobs(key, file);
        if (Result.isFailure(blobs)) return respond(c, blobs);
        head = blobs.value.head?.contents ?? '';
        base = blobs.value.base?.contents ?? null;
      } else {
        const read = await readFileWithin([target.value.workspacePath], file);
        if (Result.isFailure(read)) return respond(c, read);
        head = read.value.buffer.toString('utf8');
      }
      const lines = changed ? changedHeadLines(base, head) : new Set<number>();
      type Node = ReturnType<typeof extractTestOutline>[number];
      const mark = (nodes: Node[]): (Node & { changed: boolean })[] =>
        nodes.map((n) => ({ ...n, changed: intersectsLines(n, lines), children: mark(n.children) }));
      try {
        return c.json({ nodes: mark(extractTestOutline(file, head)) }, 200);
      } catch {
        return c.json({ nodes: [] }, 200);
      }
    })
    .get('/:key/viewed', async (c) => respond(c, await targets.viewed(c.req.param('key'))))
    .put('/:key/viewed', validate('json', z.object({ path: z.string() })), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      const file = target.value.files.find((f) => f.path === c.req.valid('json').path);
      if (!file)
        return respond(c, Result.fail({ type: 'notFound', resource: 'file', id: c.req.valid('json').path }));
      await targets.snapshot(target.value.key, file.path);
      await ctx.repos.viewed.set(
        target.value.target.projectId,
        targetLocalKey(target.value.target),
        file.path,
        viewedBlobOf(file),
      );
      return respond(c, await targets.viewed(target.value.key));
    })
    .delete('/:key/viewed', validate('query', pathQuery), async (c) => {
      const target = await withTarget(c.req.param('key'));
      if (Result.isFailure(target)) return respond(c, target);
      await ctx.repos.viewed.unset(
        target.value.target.projectId,
        targetLocalKey(target.value.target),
        c.req.valid('query').path,
      );
      return respond(c, await targets.viewed(target.value.key));
    })
    .get('/:key/notes', async (c) => {
      const key = c.req.param('key');
      const target = await withTarget(key);
      if (Result.isFailure(target)) return respond(c, target);
      const { projectId } = target.value.target;
      const rows = await ctx.repos.notes.list(projectId, targetLocalKey(target.value.target));
      const notes: NoteDto[] = [];
      for (const row of rows) {
        const file = target.value.files.find((f) => f.path === row.path);
        const currentBlob = file?.headBlob;
        let stale = false;
        let { startLine, endLine, blobSha } = row;
        if (currentBlob && currentBlob !== row.blobSha) {
          const [oldText, newText] = await Promise.all([
            targets.blobBySha(key, row.blobSha),
            targets.blobBySha(key, currentBlob),
          ]);
          if (Result.isSuccess(oldText) && Result.isSuccess(newText)) {
            const remapped = remapNote(oldText.value, newText.value, { startLine, endLine });
            stale = remapped.stale;
            if (!stale) {
              ({ startLine, endLine } = remapped.anchor);
              blobSha = currentBlob;
              await ctx.repos.notes.update(row.id, { startLine, endLine, blobSha });
            }
          } else stale = true;
        }
        notes.push({
          id: row.id,
          path: row.path,
          blobSha,
          startLine,
          endLine,
          body: row.body,
          stale,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      }
      return c.json(notes, 200);
    })
    .post(
      '/:key/notes',
      validate(
        'json',
        z.object({
          path: z.string(),
          startLine: z.number().int().min(1),
          endLine: z.number().int().min(1),
          body: z.string().min(1),
        }),
      ),
      async (c) => {
        const target = await withTarget(c.req.param('key'));
        if (Result.isFailure(target)) return respond(c, target);
        const body = c.req.valid('json');
        const file = target.value.files.find((f) => f.path === body.path);
        await targets.snapshot(target.value.key, body.path);
        const row = await ctx.repos.notes.create({
          projectId: target.value.target.projectId,
          targetKey: targetLocalKey(target.value.target),
          path: body.path,
          blobSha: file?.headBlob ?? '',
          startLine: body.startLine,
          endLine: Math.max(body.startLine, body.endLine),
          body: body.body,
        });
        return c.json(row, 200);
      },
    )
    .patch('/:key/notes/:id', validate('json', z.object({ body: z.string().min(1) })), async (c) => {
      const row = await ctx.repos.notes.update(c.req.param('id'), { body: c.req.valid('json').body });
      return row
        ? c.json(row, 200)
        : respond(c, Result.fail({ type: 'notFound', resource: 'note', id: c.req.param('id') }));
    })
    .delete('/:key/notes/:id', async (c) => {
      await ctx.repos.notes.delete(c.req.param('id'));
      return c.json({ ok: true }, 200);
    });
};
