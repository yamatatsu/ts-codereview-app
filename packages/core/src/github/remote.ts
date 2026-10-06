export type GitHubRepoRef = { owner: string; repo: string };

/** git の remote URL から owner/repo を取り出す（https / ssh / scp 形式） */
export const parseGitHubRemote = (url: string): GitHubRepoRef | null => {
  const patterns = [
    /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(url.trim());
    if (match?.[1] && match[2]) return { owner: match[1], repo: match[2] };
  }
  return null;
};

export const formatRepoRef = (ref: GitHubRepoRef): string => `${ref.owner}/${ref.repo}`;

export const parseRepoRef = (value: string): GitHubRepoRef | null => {
  const [owner, repo, ...rest] = value.split('/');
  return owner && repo && rest.length === 0 ? { owner, repo } : null;
};

/** git fetch に一時的に渡す認証ヘッダー（docs/adr/0013）。remote URL や config には保存しない */
export const authHeaderConfig = (token: string): string =>
  `http.https://github.com/.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;

/** ログ出力からトークンやヘッダーを伏せる */
export const maskSecrets = (text: string): string =>
  text
    .replace(/AUTHORIZATION: basic [A-Za-z0-9+/=]+/gi, 'AUTHORIZATION: basic ***')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '***');
