/**
 * VS Code に準拠したキーボードショートカット（docs/specs/09）。
 * Option キーとの衝突を避けるため、キーは event.code で判定する。
 */
export type CommandId =
  | 'workbench.quickOpen'
  | 'workbench.commandPalette'
  | 'nav.goToDefinition'
  | 'nav.goToTypeDefinition'
  | 'nav.findReferences'
  | 'nav.peekDefinition'
  | 'nav.back'
  | 'nav.forward'
  | 'diff.nextChange'
  | 'diff.prevChange'
  | 'files.next'
  | 'files.prev'
  | 'files.nextUnviewed'
  | 'outline.show'
  | 'test.toggle'
  | 'review.toggleViewed'
  | 'view.toggleSidebar'
  | 'view.togglePanel'
  | 'graph.open'
  | 'diff.toggleLayout'
  | 'diff.toggleSinceViewed'
  | 'note.add'
  | 'editor.openExternal'
  | 'review.refresh'
  | 'search.find';

export const DEFAULT_KEYBINDINGS: Record<CommandId, readonly string[]> = {
  'workbench.quickOpen': ['Cmd+KeyP'],
  'workbench.commandPalette': ['Cmd+Shift+KeyP'],
  'nav.goToDefinition': ['F12'],
  'nav.goToTypeDefinition': [],
  'nav.findReferences': ['Shift+F12'],
  'nav.peekDefinition': ['Alt+F12'],
  'nav.back': ['Ctrl+Minus'],
  'nav.forward': ['Ctrl+Shift+Minus'],
  'diff.nextChange': ['Alt+F5'],
  'diff.prevChange': ['Shift+Alt+F5'],
  'files.next': ['Cmd+Alt+ArrowRight'],
  'files.prev': ['Cmd+Alt+ArrowLeft'],
  'files.nextUnviewed': ['Cmd+Alt+ArrowDown'],
  'outline.show': ['Cmd+Shift+KeyO'],
  'test.toggle': ['Alt+KeyO'],
  'review.toggleViewed': ['Cmd+Alt+KeyV'],
  'view.toggleSidebar': ['Cmd+KeyB'],
  'view.togglePanel': ['Cmd+Alt+KeyB'],
  'graph.open': ['Cmd+Shift+KeyG'],
  'diff.toggleLayout': ['Cmd+Alt+KeyL'],
  'diff.toggleSinceViewed': [],
  'note.add': ['Cmd+Alt+KeyM'],
  'editor.openExternal': ['Cmd+Shift+KeyE'],
  'review.refresh': ['Cmd+KeyR'],
  'search.find': ['Cmd+KeyF'],
};

export const COMMAND_TITLES: Record<CommandId, string> = {
  'workbench.quickOpen': 'ファイルを開く',
  'workbench.commandPalette': 'コマンドパレット',
  'nav.goToDefinition': '定義へ移動',
  'nav.goToTypeDefinition': '型定義へ移動',
  'nav.findReferences': '参照を検索',
  'nav.peekDefinition': '定義をここに表示（ピーク）',
  'nav.back': '戻る',
  'nav.forward': '進む',
  'diff.nextChange': '次の変更（ハンク）',
  'diff.prevChange': '前の変更（ハンク）',
  'files.next': '次の変更ファイル',
  'files.prev': '前の変更ファイル',
  'files.nextUnviewed': '次の未 Viewed ファイル',
  'outline.show': 'アウトライン（シンボル / テストケース）',
  'test.toggle': '実装 ↔ テストを切り替え',
  'review.toggleViewed': 'Viewed を切り替え',
  'view.toggleSidebar': 'ファイル一覧の表示切り替え',
  'view.togglePanel': 'コンテキストパネルの表示切り替え',
  'graph.open': '依存グラフを開く',
  'diff.toggleLayout': 'split / unified を切り替え',
  'diff.toggleSinceViewed': '前回 Viewed からの差分を表示',
  'note.add': '現在行にメモを追加',
  'editor.openExternal': '外部エディタで開く',
  'review.refresh': '差分を再読み込み',
  'search.find': 'ページ内を検索',
};

/** KeyboardEvent を `Cmd+Shift+KeyP` 形式の文字列にする */
export const chordOf = (
  event: Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): string => {
  const parts: string[] = [];
  if (event.metaKey) parts.push('Cmd');
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.shiftKey) parts.push('Shift');
  if (event.altKey) parts.push('Alt');
  parts.push(event.code);
  return parts.join('+');
};

const MODIFIER_ORDER = ['Cmd', 'Ctrl', 'Shift', 'Alt'];

/** 修飾キーの順序を正規化する（定義側の書き方の揺れを吸収する） */
export const normalizeChord = (chord: string): string => {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const mods = parts.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
  return [...mods, key].join('+');
};

export const buildKeyIndex = (bindings: Record<CommandId, readonly string[]>): Map<string, CommandId> => {
  const index = new Map<string, CommandId>();
  for (const [command, chords] of Object.entries(bindings) as [CommandId, readonly string[]][]) {
    for (const chord of chords) index.set(normalizeChord(chord), command);
  }
  return index;
};

const KEY_LABELS: Record<string, string> = {
  Cmd: '⌘',
  Ctrl: '⌃',
  Shift: '⇧',
  Alt: '⌥',
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowDown: '↓',
  ArrowUp: '↑',
  Minus: '-',
};

/** 表示用：`Cmd+Shift+KeyP` → `⌘⇧P` */
export const formatChord = (chord: string): string =>
  chord
    .split('+')
    .map((part) => KEY_LABELS[part] ?? part.replace(/^Key/, '').replace(/^Digit/, ''))
    .join('');

/** テキスト入力中は修飾キーなしのショートカットを無効にする */
export const shouldIgnore = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement | null;
  const editable =
    target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true;
  return editable && !event.metaKey && !event.ctrlKey && !event.altKey && !/^F\d+$/.test(event.code);
};
