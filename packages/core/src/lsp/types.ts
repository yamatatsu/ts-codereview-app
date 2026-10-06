/** LSP の結果を TSugi 内部の形に正規化したもの。行・列は 0 始まり、列は UTF-16 単位 */
export type Position = { line: number; character: number };
export type Range = { start: Position; end: Position };

export type CodeLocation = {
  /** 絶対パス */
  absPath: string;
  range: Range;
};

export type HoverInfo = {
  contents: string;
  kind: 'markdown' | 'plaintext';
  range?: Range | undefined;
};

export type DocumentSymbolInfo = {
  name: string;
  kind: number;
  detail?: string | undefined;
  range: Range;
  selectionRange: Range;
  children: DocumentSymbolInfo[];
};

export type LspStatus = 'starting' | 'indexing' | 'ready' | 'error' | 'stopped';
