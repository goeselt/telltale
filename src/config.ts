import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

export type OwnerType = 'user' | 'org'

export interface GroupOwner {
  type: OwnerType
  name: string
}

export interface RepositoryGroup {
  name: string
  profile: string
  owner?: GroupOwner
  repositories?: string[]
  include_archived: boolean
  include_forks: boolean
  expose_private_names: boolean
  exclude: string[]
}

export interface CollectorFlags {
  repository_info: boolean
  repository_settings: boolean
  pull_requests: boolean
  issues: boolean
  latest_release: boolean
  workflow_runs: boolean
  rulesets: boolean
  security_findings: boolean
}

export interface SettingsPolicy {
  required?: Record<string, boolean>
  forbidden?: Record<string, boolean>
}

export interface WorkflowHealthPolicy {
  recent_runs: number
  fail_on_conclusions: string[]
}

export interface ReleasePolicy {
  required?: boolean
  require_in_default_branch?: boolean
}

export interface PullRequestRulePolicy {
  required_approving_review_count?: number
  dismiss_stale_reviews_on_push?: boolean
  require_code_owner_review?: boolean
  require_last_push_approval?: boolean
}

export interface RulesetRulesPolicy {
  required_rules: string[]
  forbidden_rules?: string[]
  pull_request?: PullRequestRulePolicy
}

export interface RulesetsPolicy {
  required_names?: string[]
  ruleset_rules?: Record<string, RulesetRulesPolicy>
}

export interface RepositoryPolicy {
  allowed_default_branches?: string[]
  allowed_visibility?: string[]
}

export interface PullRequestsPolicy {
  dependabot_warning_threshold?: number
}

export interface Policy {
  repository?: RepositoryPolicy
  settings?: SettingsPolicy
  pull_requests?: PullRequestsPolicy
  workflow_health?: WorkflowHealthPolicy
  latest_release?: ReleasePolicy
  rulesets?: RulesetsPolicy
}

export interface Profile {
  collectors: CollectorFlags
  rules: Policy
}

export interface Config {
  groups: RepositoryGroup[]
  profiles: Record<string, Profile>
}

export async function loadConfig(dir: string, reposFile?: string): Promise<Config> {
  const [reposRaw, profilesRaw] = await Promise.all([
    readYaml(reposFile ?? join(dir, 'repositories.yml')),
    readYaml(join(dir, 'profiles.yml')),
  ])

  return {
    groups: parseGroups(reposRaw),
    profiles: parseProfiles(profilesRaw),
  }
}

async function readYaml(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch {
    throw new Error(`Config file not found: ${path}`)
  }
  return yaml.load(text)
}

function parseGroups(raw: unknown): RepositoryGroup[] {
  if (!isObject(raw)) throw new Error('repositories.yml: expected object at root')
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r['groups'])) throw new Error('repositories.yml: groups must be an array')

  return (r['groups'] as unknown[]).flatMap((g, i) => {
    if (!isObject(g)) throw new Error(`repositories.yml: groups[${i}] must be an object`)
    const grp = g as Record<string, unknown>

    if (typeof grp['name'] !== 'string') throw new Error(`repositories.yml: groups[${i}].name is required`)
    if (typeof grp['profile'] !== 'string') throw new Error(`repositories.yml: groups[${i}].profile is required`)

    const hasOwner = isObject(grp['owner'])
    const hasRepos = Array.isArray(grp['repositories']) && (grp['repositories'] as unknown[]).length > 0
    if (!hasOwner && !hasRepos) {
      process.stderr.write(
        `telltale: repositories.yml: group "${grp['name']}" has no owner or repositories -- skipping\n`,
      )
      return []
    }

    let owner: GroupOwner | undefined
    if (hasOwner) {
      const o = grp['owner'] as Record<string, unknown>
      if (o['type'] !== 'user' && o['type'] !== 'org') {
        throw new Error(`repositories.yml: group "${grp['name']}".owner.type must be "user" or "org"`)
      }
      if (typeof o['name'] !== 'string') {
        throw new Error(`repositories.yml: group "${grp['name']}".owner.name is required`)
      }
      owner = { type: o['type'] as OwnerType, name: o['name'] }
    }

    return [
      {
        name: grp['name'],
        profile: grp['profile'],
        owner,
        repositories: Array.isArray(grp['repositories']) ? (grp['repositories'] as string[]) : undefined,
        include_archived: grp['include_archived'] === true,
        include_forks: grp['include_forks'] === true,
        expose_private_names: grp['expose_private_names'] === true,
        exclude: Array.isArray(grp['exclude']) ? (grp['exclude'] as string[]) : [],
      },
    ]
  })
}

function parseProfiles(raw: unknown): Record<string, Profile> {
  if (!isObject(raw)) throw new Error('profiles.yml: expected object at root')
  const r = raw as Record<string, unknown>
  if (!isObject(r['profiles'])) throw new Error('profiles.yml: profiles must be an object')

  const out: Record<string, Profile> = {}
  for (const [name, p] of Object.entries(r['profiles'] as Record<string, unknown>)) {
    if (!isObject(p)) throw new Error(`profiles.yml: profile "${name}" must be an object`)
    const profile = p as Record<string, unknown>
    const c = isObject(profile['collectors']) ? (profile['collectors'] as Record<string, unknown>) : {}
    out[name] = {
      collectors: {
        repository_info: c['repository_info'] === true,
        repository_settings: c['repository_settings'] === true,
        pull_requests: c['pull_requests'] === true,
        issues: c['issues'] === true,
        latest_release: c['latest_release'] === true,
        workflow_runs: c['workflow_runs'] === true,
        rulesets: c['rulesets'] === true,
        security_findings: c['security_findings'] === true,
      },
      rules: isObject(profile['rules']) ? (profile['rules'] as Policy) : {},
    }
  }
  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
