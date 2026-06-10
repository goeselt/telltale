import type { GitHubClient } from '../github/client.ts'
import type { WorkflowRunsData, ProbeError, ProbeStatus } from '../types.ts'

export type WorkflowRunsResult = { ok: true; data: WorkflowRunsData } | { ok: false; probe: ProbeError }

// Always fetch enough runs for per-workflow grouping in the report (up to 50).
// Health evaluation only uses the first `recentCount` completed runs.
const FETCH_COUNT = 50

export async function collectWorkflowRuns(
  client: GitHubClient,
  owner: string,
  repo: string,
  recentCount: number,
  failOnConclusions: string[],
): Promise<WorkflowRunsResult> {
  try {
    const runs = await client.listRecentWorkflowRuns(owner, repo, FETCH_COUNT)
    const completed = runs.filter((r) => r.status === 'completed')
    // Health evaluation uses only the first recentCount completed runs.
    const forEval = completed.slice(0, recentCount)
    const failSet = new Set(failOnConclusions)
    const failed = forEval.filter((r) => r.conclusion !== null && failSet.has(r.conclusion))

    let status: ProbeStatus = 'ok'
    if (forEval.length === 0) status = 'unknown'
    else if (failed.length > 0) status = 'failed'

    return {
      ok: true,
      data: {
        status,
        recent_runs_checked: forEval.length,
        failed_recent_runs: failed.length,
        runs: completed.map((r) => ({
          workflow: r.name ?? 'unknown',
          conclusion: r.conclusion,
          created_at: r.created_at,
          run_started_at: r.run_started_at,
          updated_at: r.updated_at,
          html_url: r.html_url,
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
    if (e.status === 403) return 'missing_actions_read_permission'
    return e.message
  }
  return String(err)
}
