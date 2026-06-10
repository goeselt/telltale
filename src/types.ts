export type ProbeStatus = 'ok' | 'warning' | 'failed' | 'unknown' | 'not_applicable'

export interface RepositorySettings {
  has_issues: boolean
  has_projects: boolean
  has_wiki: boolean
  allow_auto_merge: boolean | undefined
  delete_branch_on_merge: boolean | undefined
  allow_squash_merge: boolean | undefined
  allow_merge_commit: boolean | undefined
  allow_rebase_merge: boolean | undefined
}

export interface PullRequest {
  number: number
  title: string
  draft: boolean
  html_url: string
}

export interface PullRequestsData {
  open_count: number
  items: PullRequest[]
}

export interface ReleaseData {
  status: 'found' | 'not_found'
  tag_name?: string
  release_name?: string
  published_at?: string
  html_url?: string
  tag_sha?: string
  tag_verified?: boolean
  tag_verification_reason?: string
  commit_verified?: boolean
  commit_verification_reason?: string
  in_default_branch?: boolean
}

export interface WorkflowRun {
  workflow: string
  conclusion: string | null
  created_at: string
  run_started_at?: string
  updated_at: string
  html_url: string
}

export interface WorkflowRunsData {
  status: ProbeStatus
  // How many of the most recent runs were evaluated for the health status.
  recent_runs_checked: number
  failed_recent_runs: number
  // All fetched runs -- may be more than recent_runs_checked for display grouping.
  runs: WorkflowRun[]
}

export interface IssuesData {
  open_count: number
}

export interface CodeScanningAlert {
  number: number
  rule_id: string | null
  severity: string | null
}

export interface SecurityFindingsData {
  status: 'enabled' | 'not_configured'
  open_count: number
  alerts: CodeScanningAlert[]
}

export interface RulesetsData {
  status: ProbeStatus
  active_branch_ruleset_names: string[]
  // Rule types present in each named ruleset, keyed by ruleset name.
  named_rules: Record<string, string[]>
}

export interface RulesetViolation {
  ruleset: string
  missing_rules: string[]
  forbidden_rules: string[]
}

export interface RepositoryInfo {
  description: string | null
  size_kb: number
  license: string | null // SPDX ID, e.g. "MIT"
  languages: Record<string, number> // lang --> percentage (0--100, one decimal)
  last_commit_sha: string | null
  last_commit_at: string | null
  branch_count: number
}

export interface ProbeError {
  status: 'unavailable'
  reason: string
}

export interface SettingsViolation {
  key: string
  got: boolean | undefined
  issue: 'required_not_met' | 'forbidden_enabled'
}

export interface PolicyResult {
  repository: ProbeStatus
  settings: ProbeStatus
  settings_violations: SettingsViolation[]
  pull_requests: ProbeStatus
  issues: ProbeStatus
  release: ProbeStatus
  workflow_health: ProbeStatus
  rulesets: ProbeStatus
  rulesets_missing: string[]
  rulesets_violations: RulesetViolation[]
  security_findings: ProbeStatus
  overall: ProbeStatus
}

export interface RepositorySnapshot {
  full_name: string
  group: string
  profile: string
  default_branch: string
  visibility: 'public' | 'private' | 'internal'
  archived: boolean
  expose_private_name: boolean
  info?: RepositoryInfo
  settings?: RepositorySettings
  pull_requests?: PullRequestsData
  issues?: IssuesData
  release?: ReleaseData
  workflows?: WorkflowRunsData
  rulesets?: RulesetsData
  security_findings?: SecurityFindingsData
  probes: Record<string, ProbeError>
  policy: PolicyResult
}
