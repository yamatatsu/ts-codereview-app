import { pathDirsOf, GitClient, type Repositories } from '@tsugi/core';

import type { EventBus } from '../event-bus';
import type { Logger } from '../logger';
import type { AppPaths } from '../paths';
import type { SettingsStore } from '../settings-store';
import type { AnalysisHost } from './analysis-host';
import type { LspManager } from './lsp-manager';

export type AppContext = {
  paths: AppPaths;
  logger: Logger;
  bus: EventBus;
  settings: SettingsStore;
  repos: Repositories;
  analysis: AnalysisHost;
  lsp: LspManager;
  isDev: boolean;
};

/** 設定済みの git パスから GitClient を作る。未設定なら null */
export const gitClientOf = (ctx: AppContext): GitClient | null => {
  const { executables } = ctx.settings.get();
  if (!executables.git) return null;
  return new GitClient({ gitPath: executables.git, pathDirs: pathDirsOf(executables) });
};
