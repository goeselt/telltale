import type {
  GitHubClient,
  GitHubRepository,
  GitHubPullRequest,
  GitHubRelease,
  GitHubWorkflowRun,
  GitHubRuleset,
  GitHubRulesetDetail,
  GitHubCodeScanningAlert,
  TagResolution,
  GitHubLastCommit,
} from './client.ts'

const BASE = 'https://api.github.com'
const MAX_RETRIES = 3

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'telltale/0.1',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function request(url: string, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers: headers(token) })

  const isRateLimited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')

  if (isRateLimited) {
    if (attempt >= MAX_RETRIES) throw new ApiError(res.status, `Rate limit: max retries reached for ${url}`)
    const after = Number.parseInt(res.headers.get('retry-after') ?? '60', 10) * 1000
    process.stderr.write(`telltale: rate limited; waiting ${after / 1000}s\n`)
    await sleep(after)
    return request(url, token, attempt + 1)
  }

  return res
}

async function get<T>(path: string, token: string): Promise<T> {
  const res = await request(`${BASE}${path}`, token)
  if (!res.ok) throw new ApiError(res.status, `GET ${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function getAll<T>(path: string, token: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?'
  const results: T[] = []
  let url: string | null = `${BASE}${path}${sep}per_page=100`

  while (url) {
    const res = await request(url, token)
    if (!res.ok) throw new ApiError(res.status, `GET ${url}: HTTP ${res.status}`)
    const data = (await res.json()) as T[]
    results.push(...data)
    url = nextLink(res.headers.get('link') ?? '')
  }

  return results
}

function nextLink(link: string): string | null {
  const m = link.match(/<([^>]+)>;\s*rel="next"/)
  return m ? m[1]! : null
}

function mapRepo(d: Record<string, unknown>): GitHubRepository {
  const lic = d.license as Record<string, unknown> | null | undefined
  return {
    full_name: d.full_name as string,
    default_branch: (d.default_branch as string | undefined) ?? 'main',
    visibility: (d.visibility as string | undefined) ?? 'public',
    archived: (d.archived as boolean | undefined) ?? false,
    fork: (d.fork as boolean | undefined) ?? false,
    description: (d.description as string | null | undefined) ?? null,
    size: (d.size as number | undefined) ?? 0,
    open_issues_count: (d.open_issues_count as number | undefined) ?? 0,
    license_spdx: (lic?.spdx_id as string | null | undefined) ?? null,
    has_issues: (d.has_issues as boolean | undefined) ?? false,
    has_projects: (d.has_projects as boolean | undefined) ?? false,
    has_wiki: (d.has_wiki as boolean | undefined) ?? false,
    allow_auto_merge: d.allow_auto_merge as boolean | undefined,
    delete_branch_on_merge: d.delete_branch_on_merge as boolean | undefined,
    allow_squash_merge: d.allow_squash_merge as boolean | undefined,
    allow_merge_commit: d.allow_merge_commit as boolean | undefined,
    allow_rebase_merge: d.allow_rebase_merge as boolean | undefined,
  }
}

export class LiveClient implements GitHubClient {
  constructor(private readonly token: string) {}

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return mapRepo(await get<Record<string, unknown>>(`/repos/${owner}/${repo}`, this.token))
  }

  async listOpenPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    const items = await getAll<Record<string, unknown>>(`/repos/${owner}/${repo}/pulls?state=open`, this.token)
    return items.map((pr) => ({
      number: pr.number as number,
      title: pr.title as string,
      draft: (pr.draft as boolean | undefined) ?? false,
      html_url: pr.html_url as string,
    }))
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    try {
      const d = await get<Record<string, unknown>>(`/repos/${owner}/${repo}/releases/latest`, this.token)
      return {
        tag_name: d.tag_name as string,
        name: (d.name as string | undefined) ?? null,
        published_at: (d.published_at as string | undefined) ?? null,
        html_url: d.html_url as string,
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  async resolveTag(owner: string, repo: string, tag: string, defaultBranch?: string): Promise<TagResolution | null> {
    try {
      type RefObj = { object: { sha: string; type: string } }
      const ref = await get<RefObj>(`/repos/${owner}/${repo}/git/ref/tags/${tag}`, this.token)

      let commitSha: string
      let tagVerified = false
      let tagReason = 'unsigned_tag'

      if (ref.object.type === 'tag') {
        // Annotated tag -- resolve to the underlying commit and read the GPG signature.
        type AnnotatedTag = {
          object: { sha: string }
          verification: { verified: boolean; reason: string }
        }
        const tagObj = await get<AnnotatedTag>(`/repos/${owner}/${repo}/git/tags/${ref.object.sha}`, this.token)
        commitSha = tagObj.object.sha
        tagVerified = tagObj.verification.verified
        tagReason = tagObj.verification.reason
      } else {
        // Lightweight tag -- the ref SHA is the commit SHA; no tag-level signature.
        commitSha = ref.object.sha
      }

      // Commit-level signature check (separate from the tag object signature).
      let commitVerified = false
      let commitReason = 'unsigned'
      try {
        type CommitObj = { verification: { verified: boolean; reason: string } }
        const commit = await get<CommitObj>(`/repos/${owner}/${repo}/git/commits/${commitSha}`, this.token)
        commitVerified = commit.verification.verified
        commitReason = commit.verification.reason
      } catch {
        // Best-effort: leave defaults if the commit object is unreadable.
      }

      // Branch ancestry check: 'ahead' or 'identical' means the tag commit is reachable
      // from the default branch -- 'diverged' or 'behind' indicates a suspicious force-push.
      let inDefaultBranch = true
      if (defaultBranch) {
        try {
          type Compare = { status: string }
          const cmp = await get<Compare>(
            `/repos/${owner}/${repo}/compare/${encodeURIComponent(commitSha)}...${encodeURIComponent(defaultBranch)}?per_page=1`,
            this.token,
          )
          inDefaultBranch = cmp.status === 'ahead' || cmp.status === 'identical'
        } catch {
          // Best-effort: default to true to avoid false positives.
        }
      }

      return {
        commit_sha: commitSha,
        tag_verified: tagVerified,
        tag_verification_reason: tagReason,
        commit_verified: commitVerified,
        commit_verification_reason: commitReason,
        in_default_branch: inDefaultBranch,
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return null
      throw err
    }
  }

  async listRecentWorkflowRuns(owner: string, repo: string, count: number): Promise<GitHubWorkflowRun[]> {
    const d = await get<{ workflow_runs: Record<string, unknown>[] }>(
      `/repos/${owner}/${repo}/actions/runs?per_page=${Math.min(count, 100)}`,
      this.token,
    )
    return (d.workflow_runs ?? []).map((r) => ({
      name: (r.name as string | undefined) ?? null,
      conclusion: (r.conclusion as string | undefined) ?? null,
      created_at: r.created_at as string,
      run_started_at: (r.run_started_at as string | undefined) ?? undefined,
      updated_at: (r.updated_at as string | undefined) ?? (r.created_at as string),
      html_url: r.html_url as string,
      status: (r.status as string | undefined) ?? null,
    }))
  }

  async getRuleset(owner: string, repo: string, id: number): Promise<GitHubRulesetDetail | null> {
    try {
      const d = await get<Record<string, unknown>>(`/repos/${owner}/${repo}/rulesets/${id}`, this.token)
      const rules = (d.rules as Array<Record<string, unknown>> | undefined) ?? []
      return { id: d.id as number, rules: rules.map((r) => ({ type: r.type as string })) }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  async listRulesets(owner: string, repo: string): Promise<GitHubRuleset[]> {
    try {
      const items = await getAll<Record<string, unknown>>(
        `/repos/${owner}/${repo}/rulesets?includes_parents=true`,
        this.token,
      )
      return items.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        target: r.target as string | null | undefined,
        enforcement: r.enforcement as string,
      }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return []
      throw err
    }
  }

  async listUserRepositories(username: string): Promise<GitHubRepository[]> {
    const items = await getAll<Record<string, unknown>>(`/users/${username}/repos?type=owner`, this.token)
    return items.map(mapRepo)
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      return await get<Record<string, number>>(`/repos/${owner}/${repo}/languages`, this.token)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return {}
      throw err
    }
  }

  async getLastCommit(owner: string, repo: string, branch: string): Promise<GitHubLastCommit | null> {
    try {
      type CommitItem = { sha: string; commit: { committer: { date: string } } }
      const items = await get<CommitItem[]>(
        `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
        this.token,
      )
      const first = items[0]
      if (!first) return null
      return { sha: first.sha, date: first.commit.committer.date }
    } catch (err) {
      // 409 = empty repo (no commits)
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return null
      throw err
    }
  }

  async getBranchCount(owner: string, repo: string): Promise<number> {
    const res = await request(`${BASE}/repos/${owner}/${repo}/branches?per_page=1`, this.token)
    if (!res.ok) {
      await res.text()
      if (res.status === 404) return 0
      throw new ApiError(res.status, `GET /repos/${owner}/${repo}/branches: HTTP ${res.status}`)
    }
    const link = res.headers.get('link') ?? ''
    const data = (await res.json()) as unknown[]
    const m = link.match(/<[^>]+[?&]page=(\d+)>;\s*rel="last"/)
    return m ? Number.parseInt(m[1]!, 10) : data.length
  }

  async getCodeScanningAlerts(owner: string, repo: string): Promise<GitHubCodeScanningAlert[] | 'not_configured'> {
    try {
      const items = await getAll<Record<string, unknown>>(
        `/repos/${owner}/${repo}/code-scanning/alerts?state=open`,
        this.token,
      )
      return items.map((a) => {
        const rule = a.rule as Record<string, unknown> | null | undefined
        return {
          number: a.number as number,
          rule_id: (rule?.id as string | null | undefined) ?? null,
          // GitHub returns security_severity_level for security rules, severity for quality rules.
          severity:
            (rule?.security_severity_level as string | null | undefined) ??
            (rule?.severity as string | null | undefined) ??
            null,
        }
      })
    } catch (err) {
      // 404: no analyses uploaded yet; 422: code scanning not available (e.g. empty repo).
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return 'not_configured'
      throw err
    }
  }
}
