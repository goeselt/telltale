import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePolicy } from './policy.ts'
import type { RepositorySnapshot } from './types.ts'
import type { Policy } from './config.ts'

function makeSnap(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    full_name: 'test/repo',
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
      security_findings: 'not_applicable',
      overall: 'ok',
    },
    ...overrides,
  }
}

const defaultPolicy: Policy = {
  settings: {
    required: { delete_branch_on_merge: true },
    forbidden: { has_wiki: true, allow_merge_commit: true },
  },
  workflow_health: { recent_runs: 5, fail_on_conclusions: ['failure', 'timed_out'] },
  latest_release: { required: false },
}

test('settings: all required fields present and correct --> ok', () => {
  const snap = makeSnap({
    settings: {
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.settings, 'ok')
})

test('settings: required field missing --> failed', () => {
  const snap = makeSnap({
    settings: {
      has_issues: true,
      has_projects: false,
      has_wiki: false,
      allow_auto_merge: true,
      delete_branch_on_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.settings, 'failed')
})

test('settings: forbidden field enabled --> failed', () => {
  const snap = makeSnap({
    settings: {
      has_issues: true,
      has_projects: false,
      has_wiki: true,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.settings, 'failed')
})

test('settings: no settings collected --> not_applicable', () => {
  const snap = makeSnap()
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.settings, 'not_applicable')
})

test('pull_requests: zero open PRs --> ok', () => {
  const snap = makeSnap({ pull_requests: { open_count: 0, items: [] } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.pull_requests, 'ok')
})

test('pull_requests: open PRs present --> ok (informational)', () => {
  const snap = makeSnap({
    pull_requests: {
      open_count: 2,
      items: [
        { number: 1, title: 'PR 1', draft: false, html_url: 'https://github.com/test/repo/pull/1' },
        { number: 2, title: 'PR 2', draft: false, html_url: 'https://github.com/test/repo/pull/2' },
      ],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.pull_requests, 'ok')
})

test('pull_requests: probe unavailable --> unknown', () => {
  const snap = makeSnap({ probes: { pull_requests: { status: 'unavailable', reason: 'missing_permission' } } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.pull_requests, 'unknown')
})

test('release: found --> ok', () => {
  const snap = makeSnap({
    release: {
      status: 'found',
      tag_name: 'v1.0.0',
      published_at: '2026-01-01T00:00:00Z',
      html_url: 'https://example.com',
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.release, 'ok')
})

test('release: not_found and not required --> warning', () => {
  const snap = makeSnap({ release: { status: 'not_found' } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.release, 'warning')
})

test('release: not_found and required --> failed', () => {
  const snap = makeSnap({ release: { status: 'not_found' } })
  const result = evaluatePolicy(snap, { latest_release: { required: true } })
  assert.equal(result.release, 'failed')
})

test('release: tag not in default branch + require_in_default_branch --> failed', () => {
  const snap = makeSnap({
    release: { status: 'found', tag_name: 'v1.0.0', html_url: 'https://example.com', in_default_branch: false },
  })
  const result = evaluatePolicy(snap, { latest_release: { required: false, require_in_default_branch: true } })
  assert.equal(result.release, 'failed')
})

test('release: tag not in default branch without policy flag --> ok', () => {
  const snap = makeSnap({
    release: { status: 'found', tag_name: 'v1.0.0', html_url: 'https://example.com', in_default_branch: false },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.release, 'ok')
})

test('workflow_health: all success --> ok', () => {
  const snap = makeSnap({
    workflows: {
      status: 'ok',
      recent_runs_checked: 5,
      failed_recent_runs: 0,
      runs: [
        {
          workflow: 'CI',
          conclusion: 'success',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:02:00Z',
          html_url: 'https://example.com',
        },
      ],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.workflow_health, 'ok')
})

test('workflow_health: most recent run failed --> failed', () => {
  const snap = makeSnap({
    workflows: {
      status: 'failed',
      recent_runs_checked: 5,
      failed_recent_runs: 1,
      runs: [
        {
          workflow: 'CI',
          conclusion: 'failure',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:01:30Z',
          html_url: 'https://example.com',
        },
        {
          workflow: 'CI',
          conclusion: 'success',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:01:30Z',
          html_url: 'https://example.com',
        },
      ],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.workflow_health, 'failed')
})

test('workflow_health: only older run failed --> warning', () => {
  const snap = makeSnap({
    workflows: {
      status: 'failed',
      recent_runs_checked: 5,
      failed_recent_runs: 1,
      runs: [
        {
          workflow: 'CI',
          conclusion: 'success',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:01:30Z',
          html_url: 'https://example.com',
        },
        {
          workflow: 'CI',
          conclusion: 'failure',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:01:30Z',
          html_url: 'https://example.com',
        },
      ],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.workflow_health, 'warning')
})

test('overall rollup: any failed --> overall failed', () => {
  const snap = makeSnap({
    settings: {
      has_issues: true,
      has_projects: false,
      has_wiki: true,
      allow_auto_merge: true,
      delete_branch_on_merge: true,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
    },
    pull_requests: { open_count: 0, items: [] },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.overall, 'failed')
})

test('overall rollup: only warnings --> overall warning', () => {
  const snap = makeSnap({
    pull_requests: {
      open_count: 1,
      items: [{ number: 1, title: 'PR', draft: false, html_url: 'https://example.com' }],
    },
    release: { status: 'not_found' },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.overall, 'warning')
})

test('issues: data present --> ok', () => {
  const snap = makeSnap({ issues: { open_count: 5 } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.issues, 'ok')
})

test('issues: not collected --> not_applicable', () => {
  const snap = makeSnap()
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.issues, 'not_applicable')
})

test('issues: excluded from overall rollup (many open issues still ok overall)', () => {
  const snap = makeSnap({ issues: { open_count: 99 } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.overall, 'ok')
})

test('security_findings: no findings --> ok', () => {
  const snap = makeSnap({
    security_findings: { status: 'enabled', open_count: 0, alerts: [] },
    probes: { security_findings: { status: 'unavailable', reason: 'missing_permission' } },
  })
  // probes entry should not matter if data is present
  const snap2 = makeSnap({ security_findings: { status: 'enabled', open_count: 0, alerts: [] } })
  const result = evaluatePolicy(snap2, defaultPolicy)
  assert.equal(result.security_findings, 'ok')
})

test('security_findings: open alerts --> warning', () => {
  const snap = makeSnap({
    security_findings: {
      status: 'enabled',
      open_count: 2,
      alerts: [
        { number: 1, rule_id: 'js/xss', severity: 'high' },
        { number: 2, rule_id: 'js/sqli', severity: 'critical' },
      ],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.security_findings, 'warning')
})

test('security_findings: not configured --> not_applicable', () => {
  const snap = makeSnap({ security_findings: { status: 'not_configured', open_count: 0, alerts: [] } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.security_findings, 'not_applicable')
})

test('security_findings: probe unavailable --> unknown', () => {
  const snap = makeSnap({ probes: { security_findings: { status: 'unavailable', reason: 'missing_permission' } } })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.security_findings, 'unknown')
})

test('security_findings: not collected and no probe --> not_applicable', () => {
  const snap = makeSnap()
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.security_findings, 'not_applicable')
})

test('security_findings: warning included in overall rollup', () => {
  const snap = makeSnap({
    security_findings: {
      status: 'enabled',
      open_count: 1,
      alerts: [{ number: 1, rule_id: 'js/xss', severity: 'high' }],
    },
  })
  const result = evaluatePolicy(snap, defaultPolicy)
  assert.equal(result.security_findings, 'warning')
  assert.equal(result.overall, 'warning')
})
