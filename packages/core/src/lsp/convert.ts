import { fileURLToPath, pathToFileURL } from 'node:url';

import type { DocumentSymbolInfo, CodeLocation, HoverInfo, Range } from './types';

export const pathToUri = (absPath: string): string => pathToFileURL(absPath).href;
export const uriToPath = (uri: string): string => fileURLToPath(uri);

type RawLocation = { uri: string; range: Range };
type RawLocationLink = { targetUri: string; targetRange: Range; targetSelectionRange: Range };

const isLink = (value: unknown): value is RawLocationLink =>
  typeof value === 'object' && value !== null && 'targetUri' in value;

const isLocation = (value: unknown): value is RawLocation =>
  typeof value === 'object' && value !== null && 'uri' in value && 'range' in value;

/** Location | Location[] | LocationLink[] | null を正規化する */
export const normalizeLocations = (raw: unknown): CodeLocation[] => {
  if (raw === null || raw === undefined) return [];
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  const result: CodeLocation[] = [];
  for (const item of list) {
    if (isLink(item)) {
      if (item.targetUri.startsWith('file:'))
        result.push({ absPath: uriToPath(item.targetUri), range: item.targetSelectionRange });
    } else if (isLocation(item) && item.uri.startsWith('file:')) {
      result.push({ absPath: uriToPath(item.uri), range: item.range });
    }
  }
  return result;
};

type MarkedString = string | { language: string; value: string };
type RawHover = {
  contents: MarkedString | MarkedString[] | { kind: 'markdown' | 'plaintext'; value: string };
  range?: Range;
};

const markedToMarkdown = (m: MarkedString): string =>
  typeof m === 'string' ? m : `\`\`\`${m.language}\n${m.value}\n\`\`\``;

export const normalizeHover = (raw: unknown): HoverInfo | null => {
  if (raw === null || raw === undefined || typeof raw !== 'object' || !('contents' in raw)) return null;
  const hover = raw as RawHover;
  const { contents } = hover;
  let info: HoverInfo;
  if (Array.isArray(contents)) {
    info = { kind: 'markdown', contents: contents.map(markedToMarkdown).join('\n\n') };
  } else if (typeof contents === 'object' && 'kind' in contents) {
    info = { kind: contents.kind, contents: contents.value };
  } else {
    info = { kind: 'markdown', contents: markedToMarkdown(contents) };
  }
  if (info.contents.trim() === '') return null;
  if (hover.range) info.range = hover.range;
  return info;
};

type RawDocumentSymbol = {
  name: string;
  kind: number;
  detail?: string;
  range: Range;
  selectionRange: Range;
  children?: RawDocumentSymbol[];
};
type RawSymbolInformation = { name: string; kind: number; location: RawLocation };

export const normalizeSymbols = (raw: unknown): DocumentSymbolInfo[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: RawDocumentSymbol | RawSymbolInformation): DocumentSymbolInfo => {
    if ('location' in item) {
      return {
        name: item.name,
        kind: item.kind,
        range: item.location.range,
        selectionRange: item.location.range,
        children: [],
      };
    }
    const symbol: DocumentSymbolInfo = {
      name: item.name,
      kind: item.kind,
      range: item.range,
      selectionRange: item.selectionRange,
      children: normalizeSymbols(item.children ?? []),
    };
    if (item.detail) symbol.detail = item.detail;
    return symbol;
  });
};
