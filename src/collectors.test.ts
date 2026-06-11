import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectAll } from './collectors/index.ts'
import { collectRulesets } from './collectors/rulesets.ts'
import { collectWorkflowRuns } from './collectors/workflow-runs.ts'
import type { GitHubClient, GitHubRepository } from './github/client.ts'
import { LiveClient } from './github/live.ts'
import type { Profile, RepositoryGroup } from './config.ts'

function repo(full_name: string, fork: boolean): GitHubRepository {
  return {
    full_name,
    default_branch: 'main',
    visibility: 'public',
    archived: false,
    fork,
    description: null,
    size: 0,
    open_issues_count: 0,
    license_spdx: null,
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    allow_auto_merge: false,
    delete_branch_on_merge: true,
    allow_squash_merge: true,
    allow_merge_commit: true,
    allow_rebase_merge: true,
  }
}

test('collectAll: owner groups exclude only actual forks by default', async () => {
  const client = {
    listUserRepositories: () => Promise.resolve([repo('owner/project', false), repo('owner/forked', true)]),
    getRepository: (_owner: string, name: string) => Promise.resolve(repo(`owner/${name}`, false)),
  } as unknown as GitHubClient
  const group: RepositoryGroup = {
    name: 'owner',
    profile: 'default',
    owner: { type: 'user', name: 'owner' },
    include_archived: false,
    include_forks: false,
    expose_private_names: false,
    exclude: [],
  }
  const profile: Profile = {
    collectors: {
      repository_info: false,
      repository_settings: false,
      pull_requests: false,
      latest_release: false,
      workflow_runs: false,
      rulesets: false,
      issues: false,
      security_findings: false,
    },
    rules: {},
  }

  const snapshots = await collectAll(client, [group], { default: profile })

  assert.deepEqual(
    snapshots.map((s) => s.full_name),
    ['owner/project'],
  )
})

test('collectWorkflowRuns: stores completed runs and reports the actual evaluated count', async () => {
  const client = {
    listRecentWorkflowRuns: () =>
      Promise.resolve([
        {
          name: 'CI',
          status: 'in_progress',
          conclusion: null,
          created_at: '2026-06-03T00:00:00Z',
          updated_at: '2026-06-03T00:01:00Z',
          html_url: 'https://example.com/3',
          head_sha: 'aaa',
          head_branch: 'main',
        },
        {
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:01:00Z',
          html_url: 'https://example.com/2',
          head_sha: 'bbb',
          head_branch: 'main',
        },
      ]),
    listMergedPullRequests: () => Promise.resolve([]),
    getLastCommit: () => Promise.resolve(null),
  } as unknown as GitHubClient

  const result = await collectWorkflowRuns(client, 'owner', 'repo', 'main', 5, ['timed_out'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.recent_runs_checked, 1)
  assert.equal(result.data.failed_recent_runs, 0)
  assert.equal(result.data.runs.length, 1)
  assert.equal(result.data.runs[0]!.is_main, true)
})

test('collectWorkflowRuns: tag-push run on main HEAD SHA is classified is_main=true', async () => {
  const client = {
    listRecentWorkflowRuns: () =>
      Promise.resolve([
        {
          name: 'Release',
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:02:00Z',
          html_url: 'https://example.com/1',
          head_sha: 'abc123',
          head_branch: 'v1.0.0',
          event: 'push',
        },
      ]),
    listMergedPullRequests: () => Promise.resolve([]),
    getLastCommit: () => Promise.resolve({ sha: 'abc123', date: '2026-06-01T00:00:00Z' }),
  } as unknown as GitHubClient

  const result = await collectWorkflowRuns(client, 'owner', 'repo', 'main', 5, ['failure'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.runs[0]!.is_main, true)
})

test('collectWorkflowRuns: dynamic run on main HEAD SHA is not classified as main', async () => {
  const client = {
    listRecentWorkflowRuns: () =>
      Promise.resolve([
        {
          name: 'Dependabot',
          status: 'completed',
          conclusion: 'failure',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:02:00Z',
          html_url: 'https://example.com/1',
          head_sha: 'abc123',
          head_branch: 'main',
          event: 'dynamic',
        },
      ]),
    listMergedPullRequests: () => Promise.resolve([]),
    getLastCommit: () => Promise.resolve({ sha: 'abc123', date: '2026-06-01T00:00:00Z' }),
  } as unknown as GitHubClient

  const result = await collectWorkflowRuns(client, 'owner', 'repo', 'main', 5, ['failure'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.status, 'unknown')
  assert.equal(result.data.recent_runs_checked, 0)
  assert.equal(result.data.failed_recent_runs, 0)
  assert.equal(result.data.runs[0]!.is_main, false)
})

test('LiveClient.listMergedPullRequests: pages until requested merged PRs are found', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    calls.push(url)

    const page = new URL(url).searchParams.get('page')
    const body =
      page === '1'
        ? [
            { merged_at: null, head: { sha: 'closed-only' } },
            { merged_at: '2026-06-01T00:00:00Z', head: { sha: 'merged-1' } },
          ]
        : [{ merged_at: '2026-06-02T00:00:00Z', head: { sha: 'merged-2' } }]

    return Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  }) as typeof fetch

  try {
    const client = new LiveClient('token')
    const result = await client.listMergedPullRequests('owner', 'repo', 'main', 2)

    assert.deepEqual(result, [{ head_sha: 'merged-1' }, { head_sha: 'merged-2' }])
    assert.equal(calls.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('collectRulesets: fetches details for rule policy names outside required_names', async () => {
  const fetched: number[] = []
  const client = {
    listRulesets: () => Promise.resolve([{ id: 42, name: 'security', target: 'branch', enforcement: 'active' }]),
    getRuleset: (_owner: string, _repo: string, id: number) => {
      fetched.push(id)
      return Promise.resolve({ id, rules: [{ type: 'required_signatures' }] })
    },
  } as unknown as GitHubClient

  const result = await collectRulesets(client, 'owner', 'repo', ['security'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(fetched, [42])
  assert.deepEqual(result.data.named_rules, { security: ['required_signatures'] })
})
