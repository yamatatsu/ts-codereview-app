import { describe, expect, it } from 'vite-plus/test';

import { buildKeyIndex, chordOf, DEFAULT_KEYBINDINGS, formatChord, normalizeChord } from './keymap';

const ev = (
  code: string,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('keymap', () => {
  it('event.code ベースで Option との衝突を避ける', () => {
    expect(chordOf(ev('KeyO', { altKey: true }))).toBe('Alt+KeyO');
    expect(chordOf(ev('KeyP', { metaKey: true, shiftKey: true }))).toBe('Cmd+Shift+KeyP');
  });

  it('修飾キーの順序を正規化する', () => {
    expect(normalizeChord('Alt+Shift+F5')).toBe('Shift+Alt+F5');
  });

  it('既定のキーで VS Code 互換のコマンドが引ける', () => {
    const index = buildKeyIndex(DEFAULT_KEYBINDINGS);
    expect(index.get(chordOf(ev('F12')))).toBe('nav.goToDefinition');
    expect(index.get(chordOf(ev('F12', { shiftKey: true })))).toBe('nav.findReferences');
    expect(index.get(chordOf(ev('Minus', { ctrlKey: true })))).toBe('nav.back');
    expect(index.get(chordOf(ev('Minus', { ctrlKey: true, shiftKey: true })))).toBe('nav.forward');
    expect(index.get(chordOf(ev('F5', { altKey: true, shiftKey: true })))).toBe('diff.prevChange');
  });

  it('表示用の記号に変換する', () => {
    expect(formatChord('Cmd+Shift+KeyP')).toBe('⌘⇧P');
    expect(formatChord('Ctrl+Minus')).toBe('⌃-');
  });
});
