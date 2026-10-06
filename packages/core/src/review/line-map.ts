import { diffLines } from './simple-diff';

/**
 * 旧テキストの行番号（1 始まり）を新テキストの行番号に写す。
 * 対応する行が消えていれば null。
 */
export const mapLine = (oldText: string, newText: string, line: number): number | null => {
  const mapping = buildLineMapping(oldText, newText);
  return mapping.get(line) ?? null;
};

export const buildLineMapping = (oldText: string, newText: string): Map<number, number> => {
  const ops = diffLines(oldText.split('\n'), newText.split('\n'));
  const map = new Map<number, number>();
  let oldLine = 1;
  let newLine = 1;
  for (const op of ops) {
    if (op === 'equal') {
      map.set(oldLine, newLine);
      oldLine += 1;
      newLine += 1;
    } else if (op === 'delete') oldLine += 1;
    else newLine += 1;
  }
  return map;
};

export type NoteAnchor = { startLine: number; endLine: number };

/** メモの範囲を新しい内容に追従させる。範囲の両端が対応付けられなければ stale */
export const remapNote = (
  oldText: string,
  newText: string,
  anchor: NoteAnchor,
): { anchor: NoteAnchor; stale: boolean } => {
  const mapping = buildLineMapping(oldText, newText);
  const start = mapping.get(anchor.startLine);
  const end = mapping.get(anchor.endLine);
  if (start === undefined || end === undefined) return { anchor, stale: true };
  return { anchor: { startLine: start, endLine: Math.max(start, end) }, stale: false };
};
