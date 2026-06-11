import type { GitHubClient } from '../github/client.ts'
import type { PullRequestsData, ProbeError } from '../types.ts'

export type PullRequestsResult = { ok: true; data: PullRequestsData } | { ok: false; probe: ProbeError }

export async function collectPullRequests(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<PullRequestsResult> {
  try {
    const items = await client.listOpenPullRequests(owner, repo)
    return {
      ok: true,
      data: {
        open_count: items.length,
        dependabot_count: items.filter((pr) => pr.author_login === 'dependabot[bot]').length,
        items: items.map((pr) => ({
          number: pr.number,
          title: pr.title,
          draft: pr.draft,
          html_url: pr.html_url,
        })),
      },
    }
  } catch (err) {
    return { ok: false, probe: { status: 'unavailable', reason: errorReason(err) } }
  }
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { status?: number }
    if (e.status === 403) return 'missing_pull_requests_read_permission'
    return e.message
  }
  return String(err)
}
