/**
 * スキーマのマイグレーション。`PRAGMA user_version` で適用済みのバージョンを管理する。
 * 追加するときは末尾に足すだけにして、既存の要素は書き換えない。
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    default_base_branch TEXT NOT NULL,
    github_remote TEXT,
    encrypted_pat BLOB,
    collapsed_globs TEXT NOT NULL,
    test_globs TEXT NOT NULL,
    last_opened_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE pr_worktrees (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pr_number INTEGER NOT NULL,
    path TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_ref TEXT NOT NULL,
    install_status TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX pr_worktrees_project_pr ON pr_worktrees(project_id, pr_number);
  CREATE TABLE viewed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_key TEXT NOT NULL,
    path TEXT NOT NULL,
    blob_sha TEXT NOT NULL,
    viewed_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX viewed_unique ON viewed(project_id, target_key, path);
  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_key TEXT NOT NULL,
    path TEXT NOT NULL,
    blob_sha TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX notes_target ON notes(project_id, target_key);
  `,
  // 作業ツリーの内容は git のオブジェクトに無いので、Viewed / メモの時点の内容を保存する（docs/specs/08）
  `
  CREATE TABLE blob_snapshots (
    sha TEXT PRIMARY KEY,
    content BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
];
