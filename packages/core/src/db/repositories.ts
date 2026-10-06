import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { TsugiDatabase } from './database';
import {
  blobSnapshots,
  notes,
  prWorktrees,
  projects,
  viewed,
  type NoteRow,
  type PrWorktreeRow,
  type ProjectRow,
} from './schema';

export type NewProject = Omit<ProjectRow, 'id' | 'createdAt' | 'lastOpenedAt' | 'encryptedPat'>;

export class ProjectRepository {
  constructor(private readonly db: TsugiDatabase) {}

  list(): Promise<ProjectRow[]> {
    return this.db.select().from(projects).orderBy(projects.name);
  }

  async get(id: string): Promise<ProjectRow | undefined> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id));
    return rows[0];
  }

  async findByRootPath(rootPath: string): Promise<ProjectRow | undefined> {
    const rows = await this.db.select().from(projects).where(eq(projects.rootPath, rootPath));
    return rows[0];
  }

  async create(input: NewProject): Promise<ProjectRow> {
    const row: ProjectRow = {
      ...input,
      id: randomUUID(),
      encryptedPat: null,
      lastOpenedAt: null,
      createdAt: Date.now(),
    };
    await this.db.insert(projects).values(row);
    return row;
  }

  async update(
    id: string,
    patch: Partial<Omit<ProjectRow, 'id' | 'createdAt'>>,
  ): Promise<ProjectRow | undefined> {
    await this.db.update(projects).set(patch).where(eq(projects.id, id));
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id));
  }
}

export class PrWorktreeRepository {
  constructor(private readonly db: TsugiDatabase) {}

  list(): Promise<PrWorktreeRow[]> {
    return this.db.select().from(prWorktrees);
  }

  listByProject(projectId: string): Promise<PrWorktreeRow[]> {
    return this.db.select().from(prWorktrees).where(eq(prWorktrees.projectId, projectId));
  }

  async get(projectId: string, prNumber: number): Promise<PrWorktreeRow | undefined> {
    const rows = await this.db
      .select()
      .from(prWorktrees)
      .where(and(eq(prWorktrees.projectId, projectId), eq(prWorktrees.prNumber, prNumber)));
    return rows[0];
  }

  async getById(id: string): Promise<PrWorktreeRow | undefined> {
    const rows = await this.db.select().from(prWorktrees).where(eq(prWorktrees.id, id));
    return rows[0];
  }

  async upsert(row: Omit<PrWorktreeRow, 'id'>): Promise<PrWorktreeRow> {
    const existing = await this.get(row.projectId, row.prNumber);
    if (existing) {
      await this.db.update(prWorktrees).set(row).where(eq(prWorktrees.id, existing.id));
      return { ...existing, ...row };
    }
    const created = { ...row, id: randomUUID() };
    await this.db.insert(prWorktrees).values(created);
    return created;
  }

  async update(id: string, patch: Partial<Omit<PrWorktreeRow, 'id'>>): Promise<void> {
    await this.db.update(prWorktrees).set(patch).where(eq(prWorktrees.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(prWorktrees).where(eq(prWorktrees.id, id));
  }
}

export type ViewedRecord = { path: string; blobSha: string; viewedAt: number };

export class ViewedRepository {
  constructor(private readonly db: TsugiDatabase) {}

  async list(projectId: string, targetKey: string): Promise<ViewedRecord[]> {
    return this.db
      .select({ path: viewed.path, blobSha: viewed.blobSha, viewedAt: viewed.viewedAt })
      .from(viewed)
      .where(and(eq(viewed.projectId, projectId), eq(viewed.targetKey, targetKey)));
  }

  async set(projectId: string, targetKey: string, path: string, blobSha: string): Promise<void> {
    const viewedAt = Date.now();
    await this.db
      .insert(viewed)
      .values({ projectId, targetKey, path, blobSha, viewedAt })
      .onConflictDoUpdate({
        target: [viewed.projectId, viewed.targetKey, viewed.path],
        set: { blobSha, viewedAt },
      });
  }

  async unset(projectId: string, targetKey: string, path: string): Promise<void> {
    await this.db
      .delete(viewed)
      .where(and(eq(viewed.projectId, projectId), eq(viewed.targetKey, targetKey), eq(viewed.path, path)));
  }
}

export type NewNote = Pick<
  NoteRow,
  'projectId' | 'targetKey' | 'path' | 'blobSha' | 'startLine' | 'endLine' | 'body'
>;

export class NoteRepository {
  constructor(private readonly db: TsugiDatabase) {}

  list(projectId: string, targetKey: string): Promise<NoteRow[]> {
    return this.db
      .select()
      .from(notes)
      .where(and(eq(notes.projectId, projectId), eq(notes.targetKey, targetKey)))
      .orderBy(notes.path, notes.startLine);
  }

  async get(id: string): Promise<NoteRow | undefined> {
    const rows = await this.db.select().from(notes).where(eq(notes.id, id));
    return rows[0];
  }

  async create(input: NewNote): Promise<NoteRow> {
    const now = Date.now();
    const row: NoteRow = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    await this.db.insert(notes).values(row);
    return row;
  }

  async update(
    id: string,
    patch: Partial<Pick<NoteRow, 'body' | 'startLine' | 'endLine' | 'blobSha'>>,
  ): Promise<NoteRow | undefined> {
    await this.db
      .update(notes)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(notes.id, id));
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(notes).where(eq(notes.id, id));
  }
}

/** 作業ツリー上の内容のスナップショット（blob SHA → 内容） */
export class BlobSnapshotRepository {
  constructor(private readonly db: TsugiDatabase) {}

  async put(sha: string, content: Buffer): Promise<void> {
    await this.db.insert(blobSnapshots).values({ sha, content, createdAt: Date.now() }).onConflictDoNothing();
  }

  async get(sha: string): Promise<Buffer | undefined> {
    const rows = await this.db.select().from(blobSnapshots).where(eq(blobSnapshots.sha, sha));
    return rows[0]?.content;
  }
}

export type Repositories = {
  projects: ProjectRepository;
  prWorktrees: PrWorktreeRepository;
  viewed: ViewedRepository;
  notes: NoteRepository;
  blobSnapshots: BlobSnapshotRepository;
};

export const createRepositories = (db: TsugiDatabase): Repositories => ({
  projects: new ProjectRepository(db),
  prWorktrees: new PrWorktreeRepository(db),
  viewed: new ViewedRepository(db),
  notes: new NoteRepository(db),
  blobSnapshots: new BlobSnapshotRepository(db),
});
