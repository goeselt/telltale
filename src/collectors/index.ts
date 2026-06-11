import type { GitHubClient } from '../github/client.ts'
import type { RepositorySnapshot, RepositorySettings, ProbeError } from '../types.ts'
import type { RepositoryGroup, Profile } from '../config.ts'
import { collectRepositoryInfo } from './repository-info.ts'
import { collectPullRequests } from './pull-requests.ts'
import { collectRelease } from './releases.ts'
import { collectWorkflowRuns } from './workflow-runs.ts'
import { collectRulesets } from './rulesets.ts'
import { collectSecurityFindings } from './security-findings.ts'
import { evaluatePolicy, emptyPolicyResult } from '../policy.ts'

export interface CollectOptions {
  client: GitHubClient
  fullName: string
  group: RepositoryGroup
  profile: Profile
}

export async function collectSnapshot(opts: CollectOptions): Promise<RepositorySnapshot> {
  const { client, fullName, group, profile } = opts
  const policy = profile.rules
  const [owner, repo] = fullName.split('/')!

  const repoData = await client.getRepository(owner!, repo!)

  const settings: RepositorySettings = {
    has_issues: repoData.has_issues,
    has_projects: repoData.has_projects,
    has_wiki: repoData.has_wiki,
    allow_auto_merge: repoData.allow_auto_merge,
    delete_branch_on_merge: repoData.delete_branch_on_merge,
    allow_squash_merge: repoData.allow_squash_merge,
    allow_merge_commit: repoData.allow_merge_commit,
    allow_rebase_merge: repoData.allow_rebase_merge,
    allow_all_pr_creation: repoData.pull_request_creation_policy === 'all',
    secret_scanning_enabled: repoData.secret_scanning_enabled,
    secret_scanning_push_protection_enabled: repoData.secret_scanning_push_protection_enabled,
    web_commit_signoff_required: repoData.web_commit_signoff_required,
    allow_forking: repoData.allow_forking,
    allow_update_branch: repoData.allow_update_branch,
    dependabot_security_updates_enabled: repoData.dependabot_security_updates_enabled,
  }

  const c = profile.collectors
  const count = policy.workflow_health?.recent_runs ?? 5
  const failOnConclusions = policy.workflow_health?.fail_on_conclusions ?? []
  const rulesetDetailNames = [
    ...(policy.rulesets?.required_names ?? []),
    ...Object.keys(policy.rulesets?.ruleset_rules ?? {}),
  ]

  // Run enabled collectors in parallel -- independent of each other.
  const [infoResult, prsResult, releaseResult, runsResult, rulesetsResult, securityResult] = await Promise.all([
    c.repository_info
      ? collectRepositoryInfo(client, owner!, repo!, repoData, repoData.default_branch)
      : Promise.resolve(null),
    c.pull_requests ? collectPullRequests(client, owner!, repo!) : Promise.resolve(null),
    c.latest_release ? collectRelease(client, owner!, repo!, repoData.default_branch) : Promise.resolve(null),
    c.workflow_runs
      ? collectWorkflowRuns(client, owner!, repo!, repoData.default_branch, count, failOnConclusions)
      : Promise.resolve(null),
    c.rulesets ? collectRulesets(client, owner!, repo!, rulesetDetailNames) : Promise.resolve(null),
    c.security_findings ? collectSecurityFindings(client, owner!, repo!) : Promise.resolve(null),
  ])

  const probes: Record<string, ProbeError> = {}

  const snapshot: RepositorySnapshot = {
    full_name: fullName,
    group: group.name,
    profile: group.profile,
    default_branch: repoData.default_branch,
    visibility: repoData.visibility as 'public' | 'private' | 'internal',
    archived: repoData.archived,
    expose_private_name: group.expose_private_names,
    info: undefined,
    settings: c.repository_settings ? settings : undefined,
    pull_requests: undefined,
    issues: undefined,
    release: undefined,
    workflows: undefined,
    rulesets: undefined,
    security_findings: undefined,
    probes,
    policy: emptyPolicyResult,
  }

  if (infoResult) {
    if (infoResult.ok) snapshot.info = infoResult.data
    else probes['repository_info'] = infoResult.probe
  }

  if (prsResult) {
    if (prsResult.ok) snapshot.pull_requests = prsResult.data
    else probes['pull_requests'] = prsResult.probe
  }

  if (releaseResult) {
    if (releaseResult.ok) snapshot.release = releaseResult.data
    else probes['latest_release'] = releaseResult.probe
  }

  if (runsResult) {
    if (runsResult.ok) snapshot.workflows = runsResult.data
    else probes['workflow_runs'] = runsResult.probe
  }

  if (rulesetsResult) {
    if (rulesetsResult.ok) snapshot.rulesets = rulesetsResult.data
    else probes['rulesets'] = rulesetsResult.probe
  }

  if (securityResult) {
    if (securityResult.ok) snapshot.security_findings = securityResult.data
    else probes['security_findings'] = securityResult.probe
  }

  // Issues = open_issues_count (GitHub API) minus open PRs (which GitHub counts as issues).
  if (c.issues) {
    const prCount = snapshot.pull_requests?.open_count ?? 0
    snapshot.issues = { open_count: Math.max(0, repoData.open_issues_count - prCount) }
  }

  snapshot.policy = evaluatePolicy(snapshot, policy)

  // Log probe errors.
  for (const [key, err] of Object.entries(probes)) {
    log(`repo=${fullName} probe=${key} unavailable (${err.reason})`)
  }

  // Log policy outcome -- always for non-ok, concisely for ok.
  const p = snapshot.policy
  if (p.overall === 'ok') {
    log(`repo=${fullName} overall=ok`)
  } else {
    const issues: string[] = []
    if (p.repository === 'failed') {
      issues.push(`default branch "${snapshot.default_branch}" not in allowed list`)
    }
    if (p.settings === 'failed' && p.settings_violations.length > 0) {
      issues.push(`settings: ${p.settings_violations.map((v) => v.key).join(', ')}`)
    }
    if (p.workflow_health === 'failed' && snapshot.workflows) {
      const wf = snapshot.workflows
      issues.push(`workflows: ${wf.failed_recent_runs} of ${wf.recent_runs_checked} most recent runs failed`)
    }
    if (p.release === 'failed') {
      issues.push(
        `release: ${snapshot.release?.status === 'not_found' ? 'no release found' : 'tag not in default branch'}`,
      )
    }
    if (snapshot.pull_requests && snapshot.pull_requests.open_count > 0) {
      issues.push(`${snapshot.pull_requests.open_count} open PRs`)
    }
    if (p.rulesets !== 'not_applicable' && p.rulesets !== 'ok') {
      if (p.rulesets_missing.length > 0) issues.push(`rulesets missing: ${p.rulesets_missing.join(', ')}`)
      if (p.rulesets_evaluate_mode.length > 0)
        issues.push(`rulesets in evaluate mode: ${p.rulesets_evaluate_mode.join(', ')}`)
      if (p.rulesets_violations.length > 0) {
        const detail = p.rulesets_violations
          .map((v) => {
            const parts: string[] = []
            if (v.missing_rules.length > 0) parts.push(`missing: ${v.missing_rules.join(', ')}`)
            if (v.forbidden_rules.length > 0) parts.push(`forbidden: ${v.forbidden_rules.join(', ')}`)
            if (v.parameter_violations.length > 0)
              parts.push(
                `params: ${v.parameter_violations.map((pv) => `${pv.rule}.${pv.param}(got ${pv.got})`).join(', ')}`,
              )
            return `${v.ruleset}: ${parts.join('; ')}`
          })
          .join('; ')
        issues.push(`ruleset violations: ${detail}`)
      }
    }
    if (p.security_findings === 'warning' && snapshot.security_findings) {
      issues.push(
        `${snapshot.security_findings.open_count} open security alert${snapshot.security_findings.open_count !== 1 ? 's' : ''}`,
      )
    }
    log(`repo=${fullName} overall=${p.overall}${issues.length > 0 ? `: ${issues.join('; ')}` : ''}`)
  }

  return snapshot
}

export async function collectAll(
  client: GitHubClient,
  groups: RepositoryGroup[],
  profiles: Record<string, Profile>,
  concurrency = 5,
): Promise<RepositorySnapshot[]> {
  const tasks: CollectOptions[] = []

  for (const group of groups) {
    let repoNames: string[]

    if (group.repositories) {
      repoNames = group.repositories
    } else if (group.owner) {
      const { type, name } = group.owner
      if (type === 'org') {
        log(`group="${group.name}" org owner "${name}" is not supported yet -- skipping`)
        continue
      }

      const repos = await client.listUserRepositories(name)

      repoNames = repos
        .filter((r) => group.include_archived || !r.archived)
        .filter((r) => group.include_forks || !r.fork)
        .filter((r) => !group.exclude.includes(r.full_name))
        .map((r) => r.full_name)
    } else {
      continue
    }

    const profile = profiles[group.profile]
    if (!profile) {
      log(`group="${group.name}" unknown profile "${group.profile}" -- skipping`)
      continue
    }

    for (const fullName of repoNames) {
      tasks.push({ client, fullName, group, profile })
    }
  }

  log(`processing ${tasks.length} repositories`)

  const results: RepositorySnapshot[] = []
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map((t) => collectSnapshot(t)))
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value)
      else log(`collect failed: ${r.reason}`)
    }
  }

  const failed = tasks.length - results.length
  log(`done: ${results.length} snapshots${failed > 0 ? `, ${failed} failed` : ''}`)

  return results.sort((a, b) => a.full_name.localeCompare(b.full_name))
}

function log(msg: string): void {
  process.stderr.write(`telltale: ${msg}\n`)
}
