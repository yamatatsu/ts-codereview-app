import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GIT = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'].find((g) => {
  try {
    execFileSync(g, ['--version']);
    return true;
  } catch {
    return false;
  }
}) as string;

const git = (cwd: string, ...args: string[]) => execFileSync(GIT, args, { cwd, encoding: 'utf8' });

const write = (dir: string, files: Record<string, string>) => {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
};

/** E2E 用の TS リポジトリ。main に初期状態をコミットし、作業ツリーに変更を加える */
export const createE2eRepo = (): string => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tsugi-e2e-repo-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'e2e@example.com');
  git(dir, 'config', 'user.name', 'E2E');
  git(dir, 'config', 'commit.gpgsign', 'false');
  write(dir, {
    'package.json': JSON.stringify({ name: 'fixture', type: 'module' }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, module: 'esnext', moduleResolution: 'bundler' },
      include: ['src'],
    }),
    'src/math.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    'src/calc.ts':
      "import { add } from './math';\n\nexport const total = (xs: number[]) => xs.reduce((acc, x) => add(acc, x), 0);\n",
    'src/math.test.ts':
      "import { add } from './math';\n\ndescribe('add', () => {\n  it('adds', () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});\n",
    'src/util.ts': 'export const noop = () => {};\n',
  });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  write(dir, {
    'src/math.ts':
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function mul(a: number, b: number): number {\n  return a * b;\n}\n',
    'src/calc.ts':
      "import { add, mul } from './math';\n\nexport const total = (xs: number[]) => xs.reduce((acc, x) => add(acc, x), 0);\nexport const product = (xs: number[]) => xs.reduce((acc, x) => mul(acc, x), 1);\n",
    'src/math.test.ts':
      "import { add, mul } from './math';\n\ndescribe('add', () => {\n  it('adds', () => {\n    expect(add(1, 2)).toBe(3);\n  });\n});\n\ndescribe('mul', () => {\n  it('multiplies', () => {\n    expect(mul(2, 3)).toBe(6);\n  });\n});\n",
  });
  return dir;
};
