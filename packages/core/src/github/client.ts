import { Octokit } from '@octokit/rest';
import { Result } from '@praha/byethrow';

import { errorMessage, type GitHubError } from '../errors';
import type { GitHubRepoRef } from './remote';

export type PullSummary = {
  number: number;
  title: string;
  author: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
  updatedAt: string;
  draft: boolean;
  state: 'open' | 'closed';
  merged: boolean;
};

export type PullDetail = PullSummary & {
  body: string;
  labels: string[];
  requestedReviewers: string[];
  htmlUrl: string;
  headRepoFullName: string | null;
};

export type ChecksSummary = { total: number; success: number; failure: number; pending: number };

type OctokitError = { status?: number; message?: string };

const toGitHubError = (error: unknown, resource: string): GitHubError => {
  const status = (error as OctokitError).status ?? 0;
  const message = errorMessage(error);
  if (status === 401) return { type: 'github.unauthorized', message };
  if (status === 403) return { type: 'github.forbidden', message };
  if (status === 404) return { type: 'github.notFound', resource };
  return { type: 'github.requestFailed', status, message };
};

type RawPull = {
  number: number;
  title: string;
  user: { login: string } | null;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string };
  updated_at: string;
  draft?: boolean;
  state: string;
  merged_at: string | null;
};

const toSummary = (pull: RawPull): PullSummary => ({
  number: pull.number,
  title: pull.title,
  author: pull.user?.login ?? null,
  headRef: pull.head.ref,
  headSha: pull.head.sha,
  baseRef: pull.base.ref,
  updatedAt: pull.updated_at,
  draft: pull.draft ?? false,
  state: pull.state === 'open' ? 'open' : 'closed',
  merged: pull.merged_at !== null,
});

/** GitHub REST API（Octokit）。トークンはプロジェクトごとの PAT のみ（docs/adr/0013） */
export class GitHubClient {
  readonly #octokit: Octokit;
  readonly #repo: GitHubRepoRef;

  constructor(token: string, repo: GitHubRepoRef, options: { baseUrl?: string } = {}) {
    this.#octokit = new Octokit({
      auth: token,
      userAgent: 'TSugi',
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    });
    this.#repo = repo;
  }

  async getRepo(): Result.ResultAsync<
    { fullName: string; private: boolean; defaultBranch: string },
    GitHubError
  > {
    return Result.try({
      try: async () => {
        const { data } = await this.#octokit.repos.get(this.#repo);
        return { fullName: data.full_name, private: data.private, defaultBranch: data.default_branch };
      },
      catch: (error) => toGitHubError(error, `${this.#repo.owner}/${this.#repo.repo}`),
    });
  }

  async listPulls(): Result.ResultAsync<PullSummary[], GitHubError> {
    return Result.try({
      try: async () => {
        const { data } = await this.#octokit.pulls.list({
          ...this.#repo,
          state: 'open',
          per_page: 100,
          sort: 'updated',
        });
        return data.map((p) => toSummary(p as RawPull));
      },
      catch: (error) => toGitHubError(error, 'pulls'),
    });
  }

  async getPull(number: number): Result.ResultAsync<PullDetail, GitHubError> {
    return Result.try({
      try: async () => {
        const { data } = await this.#octokit.pulls.get({ ...this.#repo, pull_number: number });
        return {
          ...toSummary(data as RawPull),
          body: data.body ?? '',
          labels: data.labels.map((l) => l.name),
          requestedReviewers: (data.requested_reviewers ?? []).map((r) => r.login),
          htmlUrl: data.html_url,
          headRepoFullName: data.head.repo?.full_name ?? null,
        };
      },
      catch: (error) => toGitHubError(error, `pull #${number}`),
    });
  }

  async getChecksSummary(ref: string): Result.ResultAsync<ChecksSummary, GitHubError> {
    return Result.try({
      try: async () => {
        const { data } = await this.#octokit.checks.listForRef({ ...this.#repo, ref, per_page: 100 });
        const summary: ChecksSummary = { total: data.total_count, success: 0, failure: 0, pending: 0 };
        for (const run of data.check_runs) {
          if (run.status !== 'completed') summary.pending += 1;
          else if (
            run.conclusion === 'success' ||
            run.conclusion === 'skipped' ||
            run.conclusion === 'neutral'
          )
            summary.success += 1;
          else summary.failure += 1;
        }
        return summary;
      },
      catch: (error) => toGitHubError(error, `checks ${ref}`),
    });
  }
}
