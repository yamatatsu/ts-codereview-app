import { describe, expect, it } from 'vite-plus/test';

import { extractTestOutline } from './outline';

describe('extractTestOutline', () => {
  it('describe / it / test と修飾（each, skip, only）を木で返す', () => {
    const source = [
      "describe('calc', () => {", // 1
      "  it('adds', () => {", // 2
      '    expect(1).toBe(1);', // 3
      '  });', // 4
      "  it.skip('subtracts', () => {});", // 5
      "  describe.each([1, 2])('with %i', (n) => {", // 6
      '    test.only(`n=${n}`, () => {});', // 7
      '  });', // 8
      '});', // 9
      "test('top', () => {});", // 10
    ].join('\n');
    const outline = extractTestOutline('x.test.ts', source);
    expect(outline).toEqual([
      {
        kind: 'describe',
        name: 'calc',
        modifiers: [],
        startLine: 1,
        endLine: 9,
        children: [
          { kind: 'test', name: 'adds', modifiers: [], startLine: 2, endLine: 4, children: [] },
          { kind: 'test', name: 'subtracts', modifiers: ['skip'], startLine: 5, endLine: 5, children: [] },
          {
            kind: 'describe',
            name: 'with %i',
            modifiers: ['each'],
            startLine: 6,
            endLine: 8,
            children: [
              { kind: 'test', name: 'n=${n}', modifiers: ['only'], startLine: 7, endLine: 7, children: [] },
            ],
          },
        ],
      },
      { kind: 'test', name: 'top', modifiers: [], startLine: 10, endLine: 10, children: [] },
    ]);
  });
});
