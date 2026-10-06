import { describe, expect, it } from 'vite-plus/test';

import { authHeaderConfig, maskSecrets, parseGitHubRemote } from './remote';

describe('parseGitHubRemote', () => {
  it.each([
    ['https://github.com/o/r.git', { owner: 'o', repo: 'r' }],
    ['https://github.com/o/r', { owner: 'o', repo: 'r' }],
    ['git@github.com:o/r.git', { owner: 'o', repo: 'r' }],
    ['ssh://git@github.com/o/r.git', { owner: 'o', repo: 'r' }],
    ['https://gitlab.com/o/r.git', null],
  ])('%s', (url, expected) => {
    expect(parseGitHubRemote(url)).toEqual(expected);
  });
});

describe('maskSecrets', () => {
  it('Authorization ヘッダーと PAT を伏せる', () => {
    const header = authHeaderConfig('github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
    expect(maskSecrets(header)).not.toContain('eC1hY2Nlc3M');
    expect(maskSecrets('token ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe('token ***');
  });
});
