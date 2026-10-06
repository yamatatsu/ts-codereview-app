export type NameStatusEntry = {
  status: 'A' | 'M' | 'D' | 'R';
  path: string;
  oldPath?: string;
};

/** `git diff --name-status -M -z` の出力をパースする */
export const parseNameStatusZ = (output: string): NameStatusEntry[] => {
  const tokens = output.split('\0');
  const entries: NameStatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    if (!status) {
      i += 1;
      continue;
    }
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath !== undefined && newPath !== undefined) {
        entries.push(code === 'R' ? { status: 'R', path: newPath, oldPath } : { status: 'A', path: newPath });
      }
      i += 3;
      continue;
    }
    const filePath = tokens[i + 1];
    if (filePath !== undefined) {
      // T（型変更）や U（未マージ）は変更として扱う
      const normalized = code === 'A' || code === 'D' ? code : 'M';
      entries.push({ status: normalized, path: filePath });
    }
    i += 2;
  }
  return entries;
};

/** NUL 区切りのパス一覧 */
export const parseNulList = (output: string): string[] => output.split('\0').filter((s) => s.length > 0);

/** `git ls-tree -z <rev> -- <paths>` → path → blob SHA */
export const parseLsTreeZ = (output: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of parseNulList(output)) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const [, type, sha] = line.slice(0, tab).split(' ');
    if (type === 'blob' && sha) map.set(line.slice(tab + 1), sha);
  }
  return map;
};

/** `git check-attr -z <attr> -- <paths>` → 属性が set/true のパス */
export const parseCheckAttrZ = (output: string): Set<string> => {
  const tokens = parseNulList(output);
  const set = new Set<string>();
  for (let i = 0; i + 2 < tokens.length + 1; i += 3) {
    const file = tokens[i];
    const value = tokens[i + 2];
    if (file !== undefined && (value === 'set' || value === 'true')) set.add(file);
  }
  return set;
};

export type WorktreeEntry = { path: string; head: string | null; branch: string | null; detached: boolean };

export const parseWorktreeListPorcelain = (output: string): WorktreeEntry[] => {
  const entries: WorktreeEntry[] = [];
  for (const block of output.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    const wt = lines.find((l) => l.startsWith('worktree '));
    if (!wt) continue;
    entries.push({
      path: wt.slice('worktree '.length),
      head: lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? null,
      branch: lines.find((l) => l.startsWith('branch '))?.slice(7) ?? null,
      detached: lines.includes('detached'),
    });
  }
  return entries;
};
