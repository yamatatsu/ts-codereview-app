import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Result } from '@praha/byethrow';

import { GitClient } from '../git/client';

export const findGit = (): string => {
  for (const candidate of ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('git が見つかりません');
};

export type FixtureRepo = {
  dir: string;
  git: GitClient;
  write: (files: Record<string, string>) => Promise<void>;
  remove: (file: string) => Promise<void>;
  run: (...args: string[]) => Promise<string>;
  commit: (message: string) => Promise<string>;
  cleanup: () => Promise<void>;
};

/** テスト用の一時 git リポジトリを作る */
export const createFixtureRepo = async (files: Record<string, string> = {}): Promise<FixtureRepo> => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tsugi-fixture-')));
  const git = new GitClient({ gitPath: findGit() });
  const run = async (...args: string[]) => {
    const result = await git.run(dir, args);
    if (Result.isFailure(result)) throw new Error(JSON.stringify(result.error));
    return result.value;
  };
  const write = async (entries: Record<string, string>) => {
    for (const [file, content] of Object.entries(entries)) {
      const full = path.join(dir, file);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }
  };
  await run('init', '-q', '-b', 'main');
  await run('config', 'user.email', 'test@example.com');
  await run('config', 'user.name', 'Test');
  await run('config', 'commit.gpgsign', 'false');
  await write(files);
  const commit = async (message: string) => {
    await run('add', '-A');
    await run('commit', '-q', '--allow-empty', '-m', message);
    return (await run('rev-parse', 'HEAD')).trim();
  };
  if (Object.keys(files).length > 0) await commit('initial');
  return {
    dir,
    git,
    write,
    remove: async (file) => rm(path.join(dir, file), { force: true }),
    run,
    commit,
    cleanup: async () => rm(dir, { recursive: true, force: true }),
  };
};
