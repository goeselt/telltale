export interface GitHubRepository {
  full_name: string
  default_branch: string
  visibility: string
  archived: boolean
  fork: boolean
  description: string | null
  size: number
  open_issues_count: number
  license_spdx: string | null
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  allow_auto_merge: boolean | undefined
  delete_branch_on_merge: boolean | undefined
  allow_squash_merge: boolean | undefined
  allow_merge_commit: boolean | undefined
  allow_rebase_merge: boolean | undefined
  pull_request_creation_policy: string | undefined
  secret_scanning_enabled: boolean
  secret_scanning_push_protection_enabled: boolean
  web_commit_signoff_required: boolean
  allow_forking: boolean
  allow_update_branch: boolean
  dependabot_security_updates_enabled: boolean
}

export interface GitHubCodeScanningAlert {
  number: number
  rule_id: string | null
  severity: string | null
}

export interface GitHubPullRequest {
  number: number
  title: string
  draft: boolean
  html_url: string
  author_login: string
}

export interface GitHubRelease {
  tag_name: string
  name: string | null
  published_at: string | null
  html_url: string
}

export interface GitHubWorkflowRun {
  name: string | null
  conclusion: string | null
  created_at: string
  run_started_at?: string
  updated_at: string
  html_url: string
  status: string | null
  head_sha: string
  head_branch: string | null
  event: string
}

export interface GitHubMergedPR {
  head_sha: string
}

export interface GitHubRuleset {
  id: number
  name: string
  target: string | null | undefined
  enforcement: string
}

export interface GitHubRulesetDetail {
  id: number
  rules: Array<{ type: string; parameters?: Record<string, unknown> }>
}

export interface TagResolution {
  commit_sha: string
  tag_verified: boolean
  tag_verification_reason: string
  commit_verified: boolean
  commit_verification_reason: string
  in_default_branch: boolean
}

export interface GitHubLastCommit {
  sha: string
  date: string
  verified?: boolean
}

export interface GitHubClient {
  getRepository(owner: string, repo: string): Promise<GitHubRepository>
  listOpenPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]>
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null>
  resolveTag(owner: string, repo: string, tag: string, defaultBranch?: string): Promise<TagResolution | null>
  listRecentWorkflowRuns(owner: string, repo: string, count: number): Promise<GitHubWorkflowRun[]>
  listMergedPullRequests(owner: string, repo: string, base: string, count: number): Promise<GitHubMergedPR[]>
  listRulesets(owner: string, repo: string): Promise<GitHubRuleset[]>
  getRuleset(owner: string, repo: string, id: number): Promise<GitHubRulesetDetail | null>
  listUserRepositories(username: string): Promise<GitHubRepository[]>
  getLanguages(owner: string, repo: string): Promise<Record<string, number>>
  getLastCommit(owner: string, repo: string, branch: string): Promise<GitHubLastCommit | null>
  getBranchCount(owner: string, repo: string): Promise<number>
  getCodeScanningAlerts(owner: string, repo: string): Promise<GitHubCodeScanningAlert[] | 'not_configured'>
}
