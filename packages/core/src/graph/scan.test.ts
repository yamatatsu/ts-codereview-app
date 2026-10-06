import { describe, expect, it } from 'vite-plus/test';

import { scanModule } from './scan';

describe('scanModule', () => {
  it('static / type-only / re-export / dynamic を区別する', () => {
    const source = [
      "import { a } from './a';",
      "import type { T } from './types';",
      "import { type U } from './types2';",
      "export * from './reexp';",
      "export type { V } from './vtypes';",
      "const m = await import('./lazy');",
      'const n = await import(`./tpl/${x}`);',
      "import './side-effect';",
      "import { a as a2 } from './a';",
    ].join('\n');
    expect(scanModule('x.ts', source)).toEqual([
      { specifier: './a', kind: 'static' },
      { specifier: './types', kind: 'type-only' },
      { specifier: './types2', kind: 'type-only' },
      { specifier: './side-effect', kind: 'static' },
      { specifier: './reexp', kind: 're-export' },
      { specifier: './vtypes', kind: 'type-only' },
      { specifier: './lazy', kind: 'dynamic' },
    ]);
  });
});
