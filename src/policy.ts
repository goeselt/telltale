import type { RepositorySnapshot, PolicyResult, ProbeStatus, SettingsViolation, RulesetViolation } from './types.ts'
import type { Policy, SettingsPolicy, RulesetsPolicy, RepositoryPolicy, ReleasePolicy } from './config.ts'

const EMPTY_RESULT: PolicyResult = {
  repository: 'not_applicable',
  settings: 'not_applicable',
  settings_violations: [],
  pull_requests: 'not_applicable',
  issues: 'not_applicable',
  release: 'not_applicable',
  workflow_health: 'not_applicable',
  rulesets: 'not_applicable',
  rulesets_missing: [],
  rulesets_violations: [],
  security_findings: 'not_applicable',
  overall: 'ok',
}

export function evaluatePolicy(snap: RepositorySnapshot, policy: Policy): PolicyResult {
  const repository = evalRepository(snap, policy.repository)
  const { status: settings, violations: settings_violations } = evalSettings(snap, policy.settings)
  const pull_requests = evalPullRequests(snap)
  const issues = evalIssues(snap)
  const release = evalRelease(snap, policy.latest_release)
  const workflow_health = evalWorkflowHealth(snap, policy.workflow_health?.fail_on_conclusions ?? [])
  const {
    status: rulesets,
    missing: rulesets_missing,
    violations: rulesets_violations,
  } = evalRulesets(snap, policy.rulesets)
  const security_findings = evalSecurityFindings(snap)

  // issues is purely informational and excluded from the rollup.
  const overall = rollup([repository, settings, pull_requests, release, workflow_health, rulesets, security_findings])

  return {
    repository,
    settings,
    settings_violations,
    pull_requests,
    issues,
    release,
    workflow_health,
    rulesets,
    rulesets_missing,
    rulesets_violations,
    security_findings,
    overall,
  }
}

export { EMPTY_RESULT as emptyPolicyResult }

function evalRepository(snap: RepositorySnapshot, policy: RepositoryPolicy | undefined): ProbeStatus {
  if (!policy?.allowed_default_branches?.length) return 'not_applicable'
  return policy.allowed_default_branches.includes(snap.default_branch) ? 'ok' : 'failed'
}

function evalSettings(
  snap: RepositorySnapshot,
  policy: SettingsPolicy | undefined,
): { status: ProbeStatus; violations: SettingsViolation[] } {
  if (snap.settings === undefined) return { status: 'not_applicable', violations: [] }
  if (!policy) return { status: 'not_applicable', violations: [] }

  const s = snap.settings as unknown as Record<string, boolean | undefined>
  const violations: SettingsViolation[] = []

  for (const [key, want] of Object.entries(policy.required ?? {})) {
    const got = s[key]
    if (got === undefined) return { status: 'unknown', violations: [] }
    if (got !== want) violations.push({ key, got, issue: 'required_not_met' })
  }

  for (const [key, forbidden] of Object.entries(policy.forbidden ?? {})) {
    if (!forbidden) continue
    const got = s[key]
    if (got === undefined) return { status: 'unknown', violations: [] }
    if (got === true) violations.push({ key, got, issue: 'forbidden_enabled' })
  }

  return { status: violations.length > 0 ? 'failed' : 'ok', violations }
}

function evalPullRequests(snap: RepositorySnapshot): ProbeStatus {
  if (snap.pull_requests === undefined) {
    if ('pull_requests' in snap.probes) return 'unknown'
    return 'not_applicable'
  }
  return 'ok'
}

function evalRelease(snap: RepositorySnapshot, policy: ReleasePolicy | undefined): ProbeStatus {
  if (snap.release === undefined) {
    if ('latest_release' in snap.probes) return 'unknown'
    return 'not_applicable'
  }
  if (snap.release.status === 'not_found') {
    return (policy?.required ?? false) ? 'failed' : 'warning'
  }
  // Tag commit not reachable from the default branch -- tag was likely force-pushed/moved.
  if (policy?.require_in_default_branch && snap.release.in_default_branch === false) {
    return 'failed'
  }
  return 'ok'
}

function evalWorkflowHealth(snap: RepositorySnapshot, failOn: string[]): ProbeStatus {
  if (snap.workflows === undefined) {
    if ('workflow_runs' in snap.probes) return 'unknown'
    return 'not_applicable'
  }
  const failSet = new Set(failOn)
  // Only evaluate the first N runs; the rest are fetched for display grouping only.
  const relevant = snap.workflows.runs.slice(0, snap.workflows.recent_runs_checked)
  const isFail = (r: { conclusion: string | null }) => r.conclusion !== null && failSet.has(r.conclusion)
  // Most recent run (index 0) failed --> failed; any older run failed --> warning.
  if (relevant[0] && isFail(relevant[0])) return 'failed'
  if (relevant.slice(1).some(isFail)) return 'warning'
  return snap.workflows.status === 'unknown' ? 'unknown' : 'ok'
}

function evalRulesets(
  snap: RepositorySnapshot,
  policy: RulesetsPolicy | undefined,
): { status: ProbeStatus; missing: string[]; violations: RulesetViolation[] } {
  if (snap.rulesets === undefined) {
    if ('rulesets' in snap.probes) return { status: 'unknown', missing: [], violations: [] }
    return { status: 'not_applicable', missing: [], violations: [] }
  }

  const required = policy?.required_names ?? []
  const active = new Set(snap.rulesets.active_branch_ruleset_names)
  const missing = required.filter((n) => !active.has(n))

  const violations: RulesetViolation[] = []
  for (const [rulesetName, rulePolicy] of Object.entries(policy?.ruleset_rules ?? {})) {
    if (!active.has(rulesetName)) continue // already in missing list
    const present = new Set(snap.rulesets.named_rules[rulesetName] ?? [])
    const missingRules = rulePolicy.required_rules.filter((r) => !present.has(r))
    if (missingRules.length > 0) violations.push({ ruleset: rulesetName, missing_rules: missingRules })
  }

  const failed = missing.length > 0 || violations.length > 0
  return { status: failed ? 'failed' : 'ok', missing, violations }
}

function evalIssues(snap: RepositorySnapshot): ProbeStatus {
  if (snap.issues === undefined) return 'not_applicable'
  return 'ok'
}

function evalSecurityFindings(snap: RepositorySnapshot): ProbeStatus {
  if (snap.security_findings === undefined) {
    if ('security_findings' in snap.probes) return 'unknown'
    return 'not_applicable'
  }
  if (snap.security_findings.status === 'not_configured') return 'not_applicable'
  return snap.security_findings.open_count > 0 ? 'warning' : 'ok'
}

function rollup(statuses: ProbeStatus[]): ProbeStatus {
  const relevant = statuses.filter((s) => s !== 'not_applicable')
  if (relevant.includes('failed')) return 'failed'
  if (relevant.includes('unknown')) return 'unknown'
  if (relevant.includes('warning')) return 'warning'
  return 'ok'
}
