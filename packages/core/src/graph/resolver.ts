import { realpathSync } from 'node:fs';
import path from 'node:path';

import { ResolverFactory } from 'oxc-resolver';

export type ResolvedSpecifier =
  | { type: 'internal'; path: string }
  | { type: 'external'; packageName: string }
  | { type: 'unresolved' };

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

export const packageNameOf = (specifier: string): string => {
  if (specifier.startsWith('node:')) return specifier;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

const isBareSpecifier = (specifier: string): boolean =>
  !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('#');

/** tsconfig（paths / references）と package.json の exports を考慮してモジュールを解決する */
export class ModuleResolver {
  readonly #factory: ResolverFactory;
  readonly #root: string;
  /** シンボリックリンクを解決したルート（resolver は実パスを返すため、両方と比べる） */
  readonly #realRoot: string;

  constructor(workspaceRoot: string) {
    this.#root = workspaceRoot;
    let real = workspaceRoot;
    try {
      real = realpathSync(workspaceRoot);
    } catch {
      // 存在しないルートはそのまま使う
    }
    this.#realRoot = real;
    this.#factory = new ResolverFactory({
      tsconfig: 'auto',
      extensions: SOURCE_EXTENSIONS,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.d.ts', '.js'],
        '.jsx': ['.tsx', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
        '.cjs': ['.cts', '.cjs'],
      },
      conditionNames: ['types', 'import', 'module', 'node', 'require', 'default'],
      mainFields: ['types', 'typings', 'module', 'main'],
      builtinModules: true,
    });
  }

  /** importer は Workspace ルートからの相対パス */
  resolve(importer: string, specifier: string): ResolvedSpecifier {
    if (specifier.startsWith('node:')) return { type: 'external', packageName: specifier };
    const absImporter = path.join(this.#root, importer);
    const result = this.#factory.resolveFileSync(absImporter, specifier);
    if (result.path) {
      const base = result.path.startsWith(this.#realRoot + path.sep) ? this.#realRoot : this.#root;
      const relative = path.relative(base, result.path);
      if (relative.startsWith('..') || relative.split(path.sep).includes('node_modules')) {
        return { type: 'external', packageName: packageNameOf(specifier) };
      }
      return { type: 'internal', path: relative.split(path.sep).join('/') };
    }
    if (result.builtin) return { type: 'external', packageName: `node:${specifier}` };
    return isBareSpecifier(specifier)
      ? { type: 'external', packageName: packageNameOf(specifier) }
      : { type: 'unresolved' };
  }

  clearCache(): void {
    this.#factory.clearCache();
  }
}

/** fs を使わず、既知のファイル集合だけで相対 import を解決する（base 側の部分グラフ用） */
export const resolveRelativeInSet = (
  importer: string,
  specifier: string,
  files: ReadonlySet<string>,
): string | null => {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  const stripped = base.replace(/\.(m|c)?jsx?$/, '');
  const candidates = [
    base,
    ...['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js'].map((ext) => stripped + ext),
    ...['index.ts', 'index.tsx', 'index.js'].map((idx) => `${base}/${idx}`),
  ];
  return candidates.find((c) => files.has(c)) ?? null;
};
