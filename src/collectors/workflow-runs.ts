import type { GitHubClient } from '../github/client.ts'
import type { WorkflowRunsData, ProbeError, ProbeStatus } from '../types.ts'

export type WorkflowRunsResult = { ok: true; data: WorkflowRunsData } | { ok: false; probe: ProbeError }

// Fetch enough runs to fill up to 10 display slots across many workflows.
const FETCH_COUNT = 100
// Recent merged PRs to cross-reference for "main" classification.
const MERGED_PR_COUNT = 30

export async function collectWorkflowRuns(
  client: GitHubClient,
  owner: string,
  repo: string,
  defaultBranch: string,
  recentCount: number,
  failOnConclusions: string[],
): Promise<WorkflowRunsResult> {
  try {
    const [runs, mergedPRs, lastCommit] = await Promise.all([
      client.listRecentWorkflowRuns(owner, repo, FETCH_COUNT),
      client.listMergedPullRequests(owner, repo, defaultBranch, MERGED_PR_COUNT),
      client.getLastCommit(owner, repo, defaultBranch),
    ])

    const mergedShas = new Set(mergedPRs.map((pr) => pr.head_sha))
    const mainHeadSha = lastCommit?.sha ?? null
    // A run is "main" when it changes or verifies the state of the default branch:
    //   - any event whose head_branch is the default branch (push, dispatch, ...)
    //   - schedule runs (always against the default branch's workflow file)
    //   - the final commit of a merged PR (verified gates before merge)
    //   - any run whose SHA equals the current default branch HEAD (covers tag-push release workflows where
    //     head_branch is the tag ref, not the branch name)
    // Excluded: 'dynamic' is Dependabot's orchestration event -- it runs on main to create/update dependency PRs
    // but does not verify the repo's own code health.
    const isMain = (event: string, headBranch: string | null, sha: string): boolean => {
      if (event === 'dynamic') return false
      return (
        event === 'schedule' ||
        headBranch === defaultBranch ||
        (event === 'pull_request' && mergedShas.has(sha)) ||
        (mainHeadSha !== null && sha === mainHeadSha)
      )
    }

    const completed = runs.filter((r) => r.status === 'completed')

    // Health evaluation uses only main-branch runs.
    const mainRuns = completed.filter((r) => isMain(r.event, r.head_branch, r.head_sha))
    const forEval = mainRuns.slice(0, recentCount)
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
          is_main: isMain(r.event, r.head_branch, r.head_sha),
          event: r.event,
          head_branch: r.head_branch,
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
