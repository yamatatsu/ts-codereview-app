import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { Result } from '@praha/byethrow';
import type { FsError } from '@tsugi/core';

export const isBinary = (buffer: Buffer): boolean => buffer.subarray(0, 8000).includes(0);

/** パストラバーサルを防ぎつつ、許可されたルート配下のファイルを読む */
export const readFileWithin = async (
  roots: readonly string[],
  file: string,
): Result.ResultAsync<{ absPath: string; buffer: Buffer }, FsError> => {
  const absPath = path.resolve(roots[0] ?? '/', file);
  let real: string;
  try {
    real = await realpath(absPath);
  } catch {
    return Result.fail({ type: 'fs.notFound', path: file });
  }
  const realRoots = await Promise.all(roots.map((r) => realpath(r).catch(() => r)));
  const inside = [...roots, ...realRoots].some((root) => real === root || real.startsWith(root + path.sep));
  const absInside = roots.some((root) => absPath.startsWith(root + path.sep));
  if (!inside && !absInside) return Result.fail({ type: 'fs.outsideWorkspace', path: file });
  return Result.try({
    try: async () => ({ absPath, buffer: await readFile(real) }),
    catch: (error): FsError => ({ type: 'fs.readFailed', path: file, message: String(error) }),
  });
};
