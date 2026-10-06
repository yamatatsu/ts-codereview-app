import { parseSync } from 'oxc-parser';

export type ImportKind = 'static' | 'dynamic' | 'type-only' | 're-export';

export type ScannedImport = {
  specifier: string;
  kind: ImportKind;
};

/** 1 ファイルの import / export from / dynamic import を抽出する */
export const scanModule = (filename: string, source: string): ScannedImport[] => {
  const result = parseSync(filename, source, { sourceType: 'module' });
  const imports: ScannedImport[] = [];
  const { module } = result;

  for (const imp of module.staticImports) {
    const allType = imp.entries.length > 0 && imp.entries.every((e) => e.isType);
    const typeKeyword = /^import\s+type\s/.test(source.slice(imp.start, imp.end));
    imports.push({
      specifier: imp.moduleRequest.value,
      kind: allType || typeKeyword ? 'type-only' : 'static',
    });
  }
  for (const exp of module.staticExports) {
    const withRequest = exp.entries.filter((e) => e.moduleRequest !== null);
    const first = withRequest[0];
    if (!first?.moduleRequest) continue;
    const allType = withRequest.every((e) => e.isType);
    imports.push({ specifier: first.moduleRequest.value, kind: allType ? 'type-only' : 're-export' });
  }
  for (const dyn of module.dynamicImports) {
    const raw = source.slice(dyn.moduleRequest.start, dyn.moduleRequest.end).trim();
    const match = /^(['"`])([^'"`$]+)\1$/.exec(raw);
    if (match?.[2]) imports.push({ specifier: match[2], kind: 'dynamic' });
  }
  return dedupe(imports);
};

const KIND_PRIORITY: Record<ImportKind, number> = { static: 0, 're-export': 1, dynamic: 2, 'type-only': 3 };

/** 同じ specifier は最も「強い」種類だけを残す */
const dedupe = (imports: ScannedImport[]): ScannedImport[] => {
  const map = new Map<string, ScannedImport>();
  for (const imp of imports) {
    const existing = map.get(imp.specifier);
    if (!existing || KIND_PRIORITY[imp.kind] < KIND_PRIORITY[existing.kind]) map.set(imp.specifier, imp);
  }
  return [...map.values()];
};
