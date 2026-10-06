import { Result } from '@praha/byethrow';

import type { GitError } from '../errors';
import type { GitClient } from '../git/client';
import type { ChangedFile } from '../review/target';
import { EXTERNAL_PREFIX, type GraphEdge, type ImportGraph } from './graph';
import { packageNameOf, resolveRelativeInSet } from './resolver';
import { scanModule } from './scan';

/**
 * base 側の変更ファイルの outgoing エッジを作る（部分グラフ）。
 * 相対 import は base のツリーで解決し、それ以外（paths エイリアスなど）は head の解決結果で近似する。
 */
export const buildBaseOutgoing = async (
  git: GitClient,
  repoPath: string,
  baseRev: string,
  files: readonly ChangedFile[],
  headGraph: ImportGraph,
): Result.ResultAsync<GraphEdge[], GitError> => {
  const baseFiles = await git.lsFiles(repoPath, baseRev);
  if (Result.isFailure(baseFiles)) return baseFiles;
  const fileSet = new Set(baseFiles.value);
  const renamedFrom = new Map(files.filter((f) => f.oldPath).map((f) => [f.oldPath as string, f.path]));

  const edges: GraphEdge[] = [];
  for (const file of files) {
    if (file.status === 'A' || file.kind === 'other' || file.kind === 'collapsed') continue;
    const basePath = file.oldPath ?? file.path;
    const content = await git.showFile(repoPath, baseRev, basePath);
    if (Result.isFailure(content)) continue;
    let scanned;
    try {
      scanned = scanModule(basePath, content.value.toString('utf8'));
    } catch {
      continue;
    }
    for (const imp of scanned) {
      const relative = resolveRelativeInSet(basePath, imp.specifier, fileSet);
      if (relative) {
        edges.push({ from: file.path, to: renamedFrom.get(relative) ?? relative, kind: imp.kind });
        continue;
      }
      if (imp.specifier.startsWith('.')) continue;
      const viaHead = headGraph.resolveImports(file.path, `import ${JSON.stringify(imp.specifier)};`)[0];
      if (viaHead) edges.push({ ...viaHead, kind: imp.kind });
      else
        edges.push({ from: file.path, to: EXTERNAL_PREFIX + packageNameOf(imp.specifier), kind: imp.kind });
    }
  }
  return Result.succeed(edges);
};
