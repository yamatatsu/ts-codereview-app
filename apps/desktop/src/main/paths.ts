import path from 'node:path';

import { app } from 'electron';

export const appPaths = () => {
  const userData = app.getPath('userData');
  return {
    userData,
    database: path.join(userData, 'tsugi.db'),
    settings: path.join(userData, 'settings.json'),
    worktrees: path.join(userData, 'worktrees'),
    logs: app.getPath('logs'),
  };
};

export type AppPaths = ReturnType<typeof appPaths>;
