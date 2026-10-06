import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 同梱した typescript@7 のネイティブ tsc のパスを解決する。
 * typescript パッケージの lib/getExePath.js を使う（VS Code 拡張と同じ解決ロジック）。
 */
export const resolveBundledTscPath = async (fromDir: string): Promise<string> => {
  const require = createRequire(path.join(fromDir, 'noop.js'));
  const pkgJson = require.resolve('typescript/package.json');
  const getExePathModule = path.join(path.dirname(pkgJson), 'lib', 'getExePath.js');
  const mod = (await import(pathToFileURL(getExePathModule).href)) as { default: () => string };
  return mod.default();
};
