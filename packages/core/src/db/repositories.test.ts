import { afterEach, describe, expect, it } from 'vite-plus/test';

import { openDatabase, type DatabaseHandle } from './database';
import { createRepositories } from './repositories';

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

const setup = () => {
  handle = openDatabase(':memory:');
  return createRepositories(handle.db);
};

describe('repositories (node:sqlite + drizzle)', () => {
  it('blob のスナップショットを保存して取り出せる', async () => {
    const repos = setup();
    await repos.blobSnapshots.put('abc', Buffer.from('hello'));
    await repos.blobSnapshots.put('abc', Buffer.from('ignored'));
    expect((await repos.blobSnapshots.get('abc'))?.toString()).toBe('hello');
    expect(await repos.blobSnapshots.get('none')).toBeUndefined();
  });

  it('Project の CRUD と JSON 列・BLOB 列', async () => {
    const repos = setup();
    const created = await repos.projects.create({
      name: 'repo',
      rootPath: '/tmp/repo',
      defaultBaseBranch: 'main',
      githubRemote: 'o/r',
      collapsedGlobs: ['**/*.snap'],
      testGlobs: ['**/*.test.ts'],
    });
    await repos.projects.update(created.id, { encryptedPat: Buffer.from([1, 2, 3]) });
    const got = await repos.projects.get(created.id);
    expect(got?.collapsedGlobs).toEqual(['**/*.snap']);
    expect(got?.encryptedPat && [...got.encryptedPat]).toEqual([1, 2, 3]);
    expect((await repos.projects.list()).length).toBe(1);
    await repos.projects.delete(created.id);
    expect(await repos.projects.get(created.id)).toBeUndefined();
  });

  it('Viewed は upsert され、Project 削除でカスケードされる', async () => {
    const repos = setup();
    const p = await repos.projects.create({
      name: 'r',
      rootPath: '/r',
      defaultBaseBranch: 'main',
      githubRemote: null,
      collapsedGlobs: [],
      testGlobs: [],
    });
    await repos.viewed.set(p.id, 'pr:1', 'a.ts', 'sha1');
    await repos.viewed.set(p.id, 'pr:1', 'a.ts', 'sha2');
    expect((await repos.viewed.list(p.id, 'pr:1')).map((v) => v.blobSha)).toEqual(['sha2']);
    await repos.notes.create({
      projectId: p.id,
      targetKey: 'pr:1',
      path: 'a.ts',
      blobSha: 'sha2',
      startLine: 3,
      endLine: 4,
      body: 'memo',
    });
    await repos.projects.delete(p.id);
    expect(await repos.viewed.list(p.id, 'pr:1')).toEqual([]);
    expect(await repos.notes.list(p.id, 'pr:1')).toEqual([]);
  });
});
