import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectAll } from './collectors/index.ts'
import { collectRulesets } from './collectors/rulesets.ts'
import { collectWorkflowRuns } from './collectors/workflow-runs.ts'
import type { GitHubClient, GitHubRepository } from './github/client.ts'
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
        },
        {
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:01:00Z',
          html_url: 'https://example.com/2',
        },
      ]),
  } as unknown as GitHubClient

  const result = await collectWorkflowRuns(client, 'owner', 'repo', 5, ['timed_out'])

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.data.recent_runs_checked, 1)
  assert.equal(result.data.failed_recent_runs, 0)
  assert.equal(result.data.runs.length, 1)
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
