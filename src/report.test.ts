import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderCardGrid, renderDetail } from './report.ts'
import type { RepositorySnapshot } from './types.ts'

function makeSnap(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    full_name: 'owner/repo',
    group: 'test',
    profile: 'default',
    default_branch: 'main',
    visibility: 'public',
    archived: false,
    expose_private_name: false,
    probes: {},
    policy: {
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
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'ok',
    },
    ...overrides,
  }
}

test('renderCardGrid: public repo shows full name as card link', () => {
  const snap = makeSnap({
    release: {
      status: 'found',
      tag_name: 'v2.0.0',
      published_at: '2026-01-01T00:00:00Z',
      html_url: 'https://example.com',
    },
  })
  const out = renderCardGrid([snap])
  assert.match(out, /owner\/repo/)
  assert.match(out, /href="#owner-repo"/)
  assert.match(out, /v2\.0\.0/)
})

test('renderCardGrid: private repo with expose_private_name=false shows [private]', () => {
  const snap = makeSnap({
    visibility: 'private',
    expose_private_name: false,
    info: {
      description: 'A private repo.',
      size_kb: 100,
      license: null,
      languages: {},
      last_commit_sha: 'abc1234567890',
      last_commit_at: '2026-01-01T00:00:00Z',
      branch_count: 1,
    },
    release: {
      status: 'found',
      tag_name: 'v1.0.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
      tag_sha: 'abc1234567890',
    },
  })
  const out = renderCardGrid([snap])
  assert.match(out, /\[private\]/)
  assert.doesNotMatch(out, /owner\/repo/)
  assert.doesNotMatch(out, /href="#owner-repo"/)
})

test('renderCardGrid: private repo with expose_private_name=true shows full name', () => {
  const snap = makeSnap({ visibility: 'private', expose_private_name: true })
  const out = renderCardGrid([snap])
  assert.match(out, /owner\/repo/)
})

test('renderDetail: heading has named anchor', () => {
  const snap = makeSnap()
  const out = renderDetail(snap)
  assert.match(out, /id="owner-repo"/)
  assert.match(out, /owner\/repo/)
})

test('renderDetail: public repo has explicit GitHub link', () => {
  const snap = makeSnap({
    info: {
      description: 'A test repo.',
      size_kb: 100,
      license: 'MIT',
      languages: {},
      last_commit_sha: null,
      last_commit_at: null,
      branch_count: 1,
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /\(github\.com\)/)
  assert.match(out, /https:\/\/github\.com\/owner\/repo/)
})

test('renderDetail: private repo without expose_private_name has no GitHub link', () => {
  const snap = makeSnap({
    visibility: 'private',
    expose_private_name: false,
    info: {
      description: 'A test repo.',
      size_kb: 100,
      license: null,
      languages: {},
      last_commit_sha: 'abc1234567890',
      last_commit_at: '2026-01-01T00:00:00Z',
      branch_count: 1,
    },
    release: {
      status: 'found',
      tag_name: 'v1.0.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
      tag_sha: 'abc1234567890',
    },
  })
  const out = renderDetail(snap)
  assert.doesNotMatch(out, /https:\/\/github\.com\/owner\/repo/)
  assert.doesNotMatch(out, /id="owner-repo"/)
  assert.match(out, /\bHEAD\b/)
  assert.match(out, /\bRelease\b/)
})

test('renderDetail: shows PR count', () => {
  const snap = makeSnap({
    pull_requests: { open_count: 3, dependabot_count: 0, items: [] },
    policy: {
      repository: 'not_applicable',
      settings: 'not_applicable',
      settings_violations: [],
      pull_requests: 'ok',
      issues: 'not_applicable',
      release: 'not_applicable',
      workflow_health: 'not_applicable',
      rulesets: 'not_applicable',
      rulesets_missing: [],
      rulesets_violations: [],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /3 open PRs/)
  assert.match(out, /\u2705/)
})

test('renderDetail: no open PRs shows ok', () => {
  const snap = makeSnap({
    pull_requests: { open_count: 0, dependabot_count: 0, items: [] },
    policy: {
      repository: 'not_applicable',
      settings: 'not_applicable',
      settings_violations: [],
      pull_requests: 'ok',
      issues: 'not_applicable',
      release: 'not_applicable',
      workflow_health: 'not_applicable',
      rulesets: 'not_applicable',
      rulesets_missing: [],
      rulesets_violations: [],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /No open PRs/)
})

test('renderCardGrid: shows issues count when present', () => {
  const snap = makeSnap({
    pull_requests: { open_count: 3, dependabot_count: 0, items: [] },
    issues: { open_count: 7 },
  })
  const out = renderCardGrid([snap])
  assert.match(out, /3 PRs/)
  assert.match(out, /7 issues/)
})

test('renderCardGrid: omits issues segment when not collected', () => {
  const snap = makeSnap({ pull_requests: { open_count: 2, dependabot_count: 0, items: [] } })
  const out = renderCardGrid([snap])
  assert.match(out, /2 PRs/)
  assert.doesNotMatch(out, /issues/)
})

test('renderDetail: shows open issues count', () => {
  const snap = makeSnap({
    issues: { open_count: 4 },
    info: {
      description: null,
      size_kb: 0,
      license: null,
      languages: {},
      last_commit_sha: null,
      last_commit_at: null,
      branch_count: 0,
    },
    policy: {
      repository: 'not_applicable',
      settings: 'not_applicable',
      settings_violations: [],
      pull_requests: 'not_applicable',
      issues: 'ok',
      release: 'not_applicable',
      workflow_health: 'not_applicable',
      rulesets: 'not_applicable',
      rulesets_missing: [],
      rulesets_violations: [],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Open Issues.*4/)
})

test('renderDetail: security findings warning shown', () => {
  const snap = makeSnap({
    security_findings: {
      status: 'enabled',
      open_count: 2,
      alerts: [
        { number: 1, rule_id: 'js/xss', severity: 'high' },
        { number: 2, rule_id: 'js/sqli', severity: 'critical' },
      ],
    },
    policy: {
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
      rulesets_evaluate_mode: [],
      security_findings: 'warning',
      overall: 'warning',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Security Findings/)
  assert.match(out, /\u26A0\uFE0F/)
})

test('renderDetail: security findings not configured shown as informational', () => {
  const snap = makeSnap({
    security_findings: { status: 'not_configured', open_count: 0, alerts: [] },
    policy: {
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
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Security Findings/)
  assert.match(out, /not configured/)
})

test('renderDetail: settings violations show actionable labels', () => {
  const snap = makeSnap({
    settings: {
      has_issues: true,
      has_projects: false,
      has_wiki: true,
      allow_auto_merge: false,
      delete_branch_on_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      allow_all_pr_creation: false,
      secret_scanning_enabled: false,
      secret_scanning_push_protection_enabled: false,
      web_commit_signoff_required: false,
      allow_forking: true,
      allow_update_branch: false,
      dependabot_security_updates_enabled: false,
    },
    policy: {
      repository: 'not_applicable',
      settings: 'failed',
      settings_violations: [
        { key: 'delete_branch_on_merge', got: false, issue: 'required_not_met' },
        { key: 'allow_auto_merge', got: false, issue: 'required_not_met' },
        { key: 'has_wiki', got: true, issue: 'forbidden_enabled' },
      ],
      pull_requests: 'not_applicable',
      issues: 'not_applicable',
      release: 'not_applicable',
      workflow_health: 'not_applicable',
      rulesets: 'not_applicable',
      rulesets_missing: [],
      rulesets_violations: [],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'failed',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Automatically delete head branches.*enable/)
  assert.match(out, /Allow auto-merge.*enable/)
  assert.match(out, /Wikis.*disable/)
})

test('renderDetail: ruleset violations show actionable labels', () => {
  const snap = makeSnap({
    rulesets: {
      status: 'ok',
      active_branch_ruleset_names: ['main'],
      evaluate_branch_ruleset_names: [],
      named_rules: { main: ['pull_request'] },
      named_rule_parameters: { main: { pull_request: { required_approving_review_count: 0 } } },
    },
    policy: {
      repository: 'not_applicable',
      settings: 'not_applicable',
      settings_violations: [],
      pull_requests: 'not_applicable',
      issues: 'not_applicable',
      release: 'not_applicable',
      workflow_health: 'not_applicable',
      rulesets: 'failed',
      rulesets_missing: [],
      rulesets_violations: [
        {
          ruleset: 'main',
          missing_rules: ['deletion'],
          forbidden_rules: ['merge_queue'],
          parameter_violations: [
            { rule: 'pull_request', param: 'required_approving_review_count', expected: '>=1', got: 0 },
          ],
        },
      ],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'failed',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Restrict deletions.*add.*in ruleset:main/)
  assert.match(out, /Require merge queue.*remove.*in ruleset:main/)
  assert.match(out, /Required approvals.*&gt;=1.*in ruleset:main.*currently 0/)
})

test('renderDetail: failed workflow shows run name', () => {
  const snap = makeSnap({
    workflows: {
      status: 'failed',
      recent_runs_checked: 5,
      failed_recent_runs: 1,
      runs: [
        {
          workflow: 'Release',
          conclusion: 'failure',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:01:12Z',
          html_url: 'https://example.com',
          is_main: true,
          event: 'push',
          head_branch: 'main',
        },
      ],
    },
    policy: {
      repository: 'not_applicable',
      settings: 'not_applicable',
      settings_violations: [],
      pull_requests: 'not_applicable',
      issues: 'not_applicable',
      release: 'not_applicable',
      workflow_health: 'failed',
      rulesets: 'not_applicable',
      rulesets_missing: [],
      rulesets_violations: [],
      rulesets_evaluate_mode: [],
      security_findings: 'not_applicable',
      overall: 'failed',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Release/)
  assert.match(out, /\u274C/)
})
