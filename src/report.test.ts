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
    pull_requests: { open_count: 3, items: [] },
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
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /3 open PRs/)
  assert.match(out, /✅/)
})

test('renderDetail: no open PRs shows ok', () => {
  const snap = makeSnap({
    pull_requests: { open_count: 0, items: [] },
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
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /No open PRs/)
})

test('renderCardGrid: shows issues count when present', () => {
  const snap = makeSnap({
    pull_requests: { open_count: 3, items: [] },
    issues: { open_count: 7 },
  })
  const out = renderCardGrid([snap])
  assert.match(out, /3 PRs/)
  assert.match(out, /7 issues/)
})

test('renderCardGrid: omits issues segment when not collected', () => {
  const snap = makeSnap({ pull_requests: { open_count: 2, items: [] } })
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
      security_findings: 'warning',
      overall: 'warning',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Security Findings/)
  assert.match(out, /⚠️/)
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
      security_findings: 'not_applicable',
      overall: 'ok',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Security Findings/)
  assert.match(out, /not configured/)
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
      security_findings: 'not_applicable',
      overall: 'failed',
    },
  })
  const out = renderDetail(snap)
  assert.match(out, /Release/)
  assert.match(out, /❌/)
})
