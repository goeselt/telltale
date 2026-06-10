import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

export class FixtureClient implements GitHubClient {
  constructor(private readonly dir: string) {}

  private async load<T>(owner: string, repo: string, file: string): Promise<T> {
    const path = join(this.dir, `${owner}-${repo}`, file)
    let text: string
    try {
      text = await readFile(path, 'utf-8')
    } catch (err) {
      const { code } = err as NodeJS.ErrnoException
      if (code === 'ENOENT') throw new Error(`Fixture not found: ${path}`, { cause: err })
      throw err
    }
    return JSON.parse(text) as T
  }

  private async loadOptional<T>(owner: string, repo: string, file: string): Promise<T | null> {
    try {
      return await this.load<T>(owner, repo, file)
    } catch (err) {
      if ((err as Error).message.startsWith('Fixture not found:')) return null
      throw err
    }
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const d = await this.load<Record<string, unknown>>(owner, repo, 'repository.json')
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

  async listOpenPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    const items = await this.load<Record<string, unknown>[]>(owner, repo, 'pulls.json')
    return items.map((pr) => ({
      number: pr.number as number,
      title: pr.title as string,
      draft: (pr.draft as boolean | undefined) ?? false,
      html_url: pr.html_url as string,
    }))
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    const d = await this.loadOptional<Record<string, unknown>>(owner, repo, 'releases-latest.json')
    if (!d) return null
    return {
      tag_name: d.tag_name as string,
      name: (d.name as string | undefined) ?? null,
      published_at: (d.published_at as string | undefined) ?? null,
      html_url: d.html_url as string,
    }
  }

  resolveTag(owner: string, repo: string, tag: string): Promise<TagResolution | null> {
    return this.loadOptional<TagResolution>(owner, repo, `tag-${tag}.json`)
  }

  async listRecentWorkflowRuns(owner: string, repo: string, count: number): Promise<GitHubWorkflowRun[]> {
    void count
    const d = await this.load<{ workflow_runs: Record<string, unknown>[] }>(owner, repo, 'actions-runs.json')
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
    const d = await this.loadOptional<Record<string, unknown>>(owner, repo, `ruleset-${id}.json`)
    if (!d) return null
    const rules = (d.rules as Array<Record<string, unknown>> | undefined) ?? []
    return { id: (d.id as number | undefined) ?? id, rules: rules.map((r) => ({ type: r.type as string })) }
  }

  async listRulesets(owner: string, repo: string): Promise<GitHubRuleset[]> {
    const items = await this.loadOptional<Record<string, unknown>[]>(owner, repo, 'rulesets.json')
    if (!items) return []
    return items.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      target: r.target as string | null | undefined,
      enforcement: r.enforcement as string,
    }))
  }

  async listUserRepositories(username: string): Promise<GitHubRepository[]> {
    const items = await this.loadOptional<Record<string, unknown>[]>(username, '_repos', 'list.json')
    return (items ?? []).map((d) => {
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
    })
  }

  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const d = await this.loadOptional<Record<string, number>>(owner, repo, 'languages.json')
    return d ?? {}
  }

  getLastCommit(owner: string, repo: string, branch: string): Promise<GitHubLastCommit | null> {
    void branch
    return this.loadOptional<GitHubLastCommit>(owner, repo, 'last-commit.json')
  }

  async getBranchCount(owner: string, repo: string): Promise<number> {
    const d = await this.loadOptional<{ count: number }>(owner, repo, 'branch-count.json')
    return d?.count ?? 1
  }

  async getCodeScanningAlerts(owner: string, repo: string): Promise<GitHubCodeScanningAlert[] | 'not_configured'> {
    const items = await this.loadOptional<Record<string, unknown>[]>(owner, repo, 'code-scanning-alerts.json')
    if (!items) return 'not_configured'
    return items.map((a) => ({
      number: a.number as number,
      rule_id: (a.rule_id as string | null | undefined) ?? null,
      severity: (a.severity as string | null | undefined) ?? null,
    }))
  }
}
