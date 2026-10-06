import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  defaultBaseBranch: text('default_base_branch').notNull(),
  githubRemote: text('github_remote'),
  encryptedPat: blob('encrypted_pat', { mode: 'buffer' }),
  collapsedGlobs: text('collapsed_globs', { mode: 'json' }).$type<string[]>().notNull(),
  testGlobs: text('test_globs', { mode: 'json' }).$type<string[]>().notNull(),
  lastOpenedAt: integer('last_opened_at'),
  createdAt: integer('created_at').notNull(),
});

export const prWorktrees = sqliteTable(
  'pr_worktrees',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    prNumber: integer('pr_number').notNull(),
    path: text('path').notNull(),
    headSha: text('head_sha').notNull(),
    baseRef: text('base_ref').notNull(),
    installStatus: text('install_status')
      .$type<'pending' | 'running' | 'ok' | 'fallback' | 'failed'>()
      .notNull(),
    lastOpenedAt: integer('last_opened_at').notNull(),
  },
  (t) => [uniqueIndex('pr_worktrees_project_pr').on(t.projectId, t.prNumber)],
);

export const viewed = sqliteTable(
  'viewed',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetKey: text('target_key').notNull(),
    path: text('path').notNull(),
    blobSha: text('blob_sha').notNull(),
    viewedAt: integer('viewed_at').notNull(),
  },
  (t) => [uniqueIndex('viewed_unique').on(t.projectId, t.targetKey, t.path)],
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetKey: text('target_key').notNull(),
    path: text('path').notNull(),
    blobSha: text('blob_sha').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('notes_target').on(t.projectId, t.targetKey)],
);

export const blobSnapshots = sqliteTable('blob_snapshots', {
  sha: text('sha').primaryKey(),
  content: blob('content', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at').notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type PrWorktreeRow = typeof prWorktrees.$inferSelect;
export type ViewedRow = typeof viewed.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
