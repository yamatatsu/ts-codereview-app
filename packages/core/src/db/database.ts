import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { MIGRATIONS } from './migrations';
import * as schema from './schema';

export type TsugiDatabase = SqliteRemoteDatabase<typeof schema>;

export type DatabaseHandle = {
  db: TsugiDatabase;
  raw: DatabaseSync;
  close: () => void;
};

const migrate = (raw: DatabaseSync): void => {
  const row = raw.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    raw.exec('BEGIN');
    try {
      raw.exec(MIGRATIONS[version] ?? '');
      raw.exec(`PRAGMA user_version = ${version + 1}`);
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }
};

/** node:sqlite と drizzle（sqlite-proxy）で DB を開く（docs/adr/0015） */
export const openDatabase = (file: string): DatabaseHandle => {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);

  const db = drizzle(
    async (sql, params, method) => {
      const statement = raw.prepare(sql);
      const args = params as SQLInputValue[];
      if (method === 'run') {
        statement.run(...args);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      if (method === 'get') {
        const row = statement.get(...args);
        return { rows: (row ?? undefined) as unknown as unknown[] };
      }
      return { rows: statement.all(...args) as unknown[] };
    },
    { schema },
  );

  return { db, raw, close: () => raw.close() };
};
