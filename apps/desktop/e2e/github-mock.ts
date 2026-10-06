import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export type MockPull = {
  number: number;
  title: string;
  headSha: string;
  headRef: string;
  baseRef: string;
  state: 'open' | 'closed';
};

/** GitHub REST API の必要最小限のモック */
export const startGitHubMock = async (owner: string, repo: string, pulls: MockPull[]) => {
  const requests: string[] = [];
  const toJson = (p: MockPull) => ({
    number: p.number,
    title: p.title,
    user: { login: 'octocat' },
    head: { ref: p.headRef, sha: p.headSha, repo: { full_name: `${owner}/${repo}` } },
    base: { ref: p.baseRef },
    updated_at: new Date().toISOString(),
    draft: false,
    state: p.state,
    merged_at: null,
    body: '## 概要\nE2E 用の PR です。',
    labels: [{ name: 'e2e' }],
    requested_reviewers: [],
    html_url: `https://github.com/${owner}/${repo}/pull/${p.number}`,
  });
  const server: Server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url} auth=${req.headers.authorization ? 'yes' : 'no'}`);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const base = `/repos/${owner}/${repo}`;
    if (url.pathname === base)
      return send(200, { full_name: `${owner}/${repo}`, private: true, default_branch: 'main' });
    if (url.pathname === `${base}/pulls`)
      return send(200, pulls.filter((p) => p.state === 'open').map(toJson));
    const pull = /\/pulls\/(\d+)$/.exec(url.pathname);
    if (pull) {
      const found = pulls.find((p) => p.number === Number(pull[1]));
      return found ? send(200, toJson(found)) : send(404, { message: 'Not Found' });
    }
    if (/\/commits\/[^/]+\/check-runs$/.test(url.pathname)) {
      return send(200, { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] });
    }
    return send(404, { message: 'Not Found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
};
