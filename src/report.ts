import type { RepositorySnapshot, ProbeStatus, WorkflowRun } from './types.ts'

const STATUS_LABEL: Record<ProbeStatus, string> = {
  ok: ':white_check_mark:',
  warning: ':warning:',
  failed: ':x:',
  unknown: ':grey_question:',
  not_applicable: '--',
}

interface CardColors {
  bg: string
  border: string
  text: string
  muted: string
}

const CARD_COLORS: Record<string, CardColors> = {
  ok: { bg: '#ecf7ed', border: '#27a641', text: '#0e4421', muted: '#2d7a4f' },
  warning: { bg: '#fef9e7', border: '#d4a017', text: '#6b4600', muted: '#9a6800' },
  failed: { bg: '#fdf0e6', border: '#c95e00', text: '#7a2d00', muted: '#9a4800' },
  unknown: { bg: '#f5f5f5', border: '#9e9e9e', text: '#424242', muted: '#757575' },
}

export function renderReport(snapshots: RepositorySnapshot[], generatedAt: string): string {
  const parts: string[] = []

  parts.push(`# Repository Overview\n`)
  parts.push(`Generated: ${generatedAt}\n`)
  parts.push(renderCardGrid(snapshots))

  for (const snap of snapshots) {
    parts.push(renderDetail(snap))
  }

  const gaps = snapshots.flatMap((s) =>
    Object.entries(s.probes).map(([k, p]) => `| ${displayName(s)} | \`${k}\` | ${p.reason} |`),
  )
  if (gaps.length > 0) {
    parts.push('## Permission Gaps\n')
    parts.push('| Repository | Probe | Reason |')
    parts.push('| --- | --- | --- |')
    parts.push(...gaps)
    parts.push('')
  }

  return `${parts.join('\n')}\n`
}

export function renderCardGrid(snapshots: RepositorySnapshot[]): string {
  // Preserve insertion order; group by snap.group.
  const groups = new Map<string, RepositorySnapshot[]>()
  for (const s of snapshots) {
    const g = groups.get(s.group)
    if (!g) groups.set(s.group, [s])
    else g.push(s)
  }

  const sections: string[] = []
  let first = true
  for (const [groupName, snaps] of groups) {
    const n = snaps.length
    const label = `${groupName} (${n} repo${n !== 1 ? 's' : ''})`
    const topMargin = first ? '0' : '20px'
    first = false
    const cards = snaps.map(
      (s) => `<div style="flex:1 1 260px;min-width:260px;max-width:420px;">${renderCard(s)}</div>`,
    )
    sections.push(
      `<div style="margin-top:${topMargin};margin-bottom:6px;font-weight:600;font-size:0.82em;color:#888;letter-spacing:0.06em;text-transform:uppercase;">${label}</div>`,
      `<div style="display:flex;flex-wrap:wrap;gap:8px;">\n${cards.join('\n')}\n</div>`,
    )
  }
  return `${sections.join('\n')}\n`
}

export function renderDetail(snap: RepositorySnapshot): string {
  const parts: string[] = []

  const anchor = repoAnchor(snap)
  const headingName = snap.visibility !== 'public' && !snap.expose_private_name ? '[private]' : snap.full_name

  parts.push(`<a id="${anchor}"></a>\n`)
  parts.push(`### ${headingName}\n`)

  if (snap.info) {
    parts.push(...infoBlock(snap))
  }

  parts.push('| Check | Result | Detail |')
  parts.push('| --- | --- | --- |')
  parts.push(...checkRows(snap))
  parts.push('')

  if (snap.workflows && snap.workflows.runs.length > 0) {
    parts.push(workflowTable(snap.workflows.runs, snap.workflows.recent_runs_checked))
  }

  if (snap.policy.settings === 'failed' && snap.policy.settings_violations.length > 0) {
    parts.push('**Settings violations:**\n')
    parts.push('| Setting | Value | Issue |')
    parts.push('| --- | --- | --- |')
    for (const v of snap.policy.settings_violations) {
      const val = v.got === undefined ? '?' : `\`${v.got}\``
      const issue = v.issue === 'forbidden_enabled' ? 'forbidden' : 'required, not set'
      parts.push(`| \`${v.key}\` | ${val} | ${issue} |`)
    }
    parts.push('')
  }

  if (snap.policy.rulesets_missing.length > 0) {
    parts.push('**Missing rulesets:**\n')
    for (const name of snap.policy.rulesets_missing) {
      parts.push(`- \`${name}\``)
    }
    parts.push('')
  }

  if (snap.policy.rulesets_violations.length > 0) {
    parts.push('**Ruleset rule violations:**\n')
    parts.push('| Ruleset | Missing rules |')
    parts.push('| --- | --- |')
    for (const v of snap.policy.rulesets_violations) {
      parts.push(`| \`${v.ruleset}\` | ${v.missing_rules.map((r) => `\`${r}\``).join(', ')} |`)
    }
    parts.push('')
  }

  return parts.join('\n')
}

// --- card helpers ---

function renderCard(snap: RepositorySnapshot): string {
  const anchor = repoAnchor(snap)
  const name = snap.visibility !== 'public' && !snap.expose_private_name ? '[private]' : snap.full_name
  const c = CARD_COLORS[snap.policy.overall] ?? CARD_COLORS['unknown']!

  const rows: string[] = []

  // Release row
  if (snap.release !== undefined) {
    if (snap.release.status === 'not_found') {
      rows.push('no release')
    } else {
      const r = snap.release
      const tag = r.tag_name ?? '?'
      const relParts: string[] = [`Release <strong>${tag}</strong>`]
      if (r.tag_sha) relParts.push(`<code>${r.tag_sha.slice(0, 7)}</code>`)
      rows.push(relParts.join(' &middot; '))
    }
  }

  // HEAD SHA + date row
  if (snap.info?.last_commit_sha) {
    rows.push(`HEAD <code>${snap.info.last_commit_sha.slice(0, 7)}</code>`)
  }

  // Branch count / PRs row
  const metaParts: string[] = []
  if (snap.info?.branch_count !== undefined)
    metaParts.push(`${snap.info.branch_count} branch${snap.info.branch_count !== 1 ? 'es' : ''}`)
  if (snap.pull_requests !== undefined) {
    const n = snap.pull_requests.open_count
    metaParts.push(n === 0 ? '0 PRs' : `<strong>${n} PR${n > 1 ? 's' : ''}</strong>`)
  }
  if (snap.issues !== undefined) {
    const n = snap.issues.open_count
    metaParts.push(`${n} issue${n !== 1 ? 's' : ''}`)
  }
  if (metaParts.length > 0) {
    rows.push(`<span style="color:${c.muted};">${metaParts.join(' &middot; ')}</span>`)
  }

  // Top 2 languages row (last)
  if (snap.info) {
    const top2 = Object.entries(snap.info.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
    if (top2.length > 0) {
      rows.push(`<span style="color:${c.muted};">${top2.map(([l, p]) => `${l} ${p}%`).join(' &middot; ')}</span>`)
    }
  }

  const bodyHtml = rows.join('<br>\n        ')

  return `<a href="#${anchor}" style="display:block;background:${c.bg};border:2px solid ${c.border};border-radius:8px;padding:14px 16px;box-sizing:border-box;text-decoration:none;">
  <div style="font-weight:700;font-size:0.95em;color:${c.text};margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${name}">${name}</div>
  <div style="font-size:0.82em;color:${c.text};line-height:1.7;">
      ${bodyHtml}
  </div>
</a>`
}

// Derives a stable HTML anchor name from the repository snapshot.
// Used for both the <a name> tag in detail headings and card cover links.
function repoAnchor(snap: RepositorySnapshot): string {
  if (!canExposeRepoName(snap)) return `private-${stableHash(snap.full_name)}`
  return snap.full_name
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function stableHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

// --- shared helpers ---

function displayName(snap: RepositorySnapshot): string {
  if (!canExposeRepoName(snap)) return '[private]'
  return `\`${snap.full_name}\``
}

function canExposeRepoName(snap: RepositorySnapshot): boolean {
  return snap.visibility === 'public' || snap.expose_private_name
}

function infoBlock(snap: RepositorySnapshot): string[] {
  const info = snap.info!
  const lines: string[] = []

  // Description as blockquote with inline host link
  const desc = info.description ? sanitizeDescription(info.description) : '*no description*'
  const canLink = canExposeRepoName(snap)
  if (canLink) {
    const repoUrl = `https://github.com/${snap.full_name}`
    const host = new URL(repoUrl).hostname
    lines.push(`> ${desc} [(${host})](${repoUrl})`)
  } else {
    lines.push(`> ${desc}`)
  }
  lines.push('')

  // Metadata as bullet list
  // HEAD branch + last commit on that branch combined into one item
  let defaultBranchItem: string
  if (info.last_commit_at) {
    const date = info.last_commit_at.slice(0, 10)
    if (info.last_commit_sha) {
      const short = info.last_commit_sha.slice(0, 7)
      const sha = canLink
        ? `[\`${short}\`](https://github.com/${snap.full_name}/commit/${info.last_commit_sha})`
        : `\`${short}\``
      defaultBranchItem = `**HEAD:** \`${snap.default_branch}\` - ${sha} - ${date}`
    } else {
      defaultBranchItem = `**HEAD:** \`${snap.default_branch}\` - ${date}`
    }
  } else {
    defaultBranchItem = `**HEAD:** \`${snap.default_branch}\``
  }

  const items: Array<string | null> = [
    defaultBranchItem,
    releaseItem(snap),
    info.license ? `**License:** ${info.license}` : null,
    `**Visibility:** ${snap.visibility}`,
    `**Size:** ${formatSize(info.size_kb)}`,
    `**Branches:** ${info.branch_count}`,
  ]

  if (snap.pull_requests !== undefined) {
    items.push(`**Open PRs:** ${snap.pull_requests.open_count}`)
  }
  if (snap.issues !== undefined) {
    items.push(`**Open Issues:** ${snap.issues.open_count}`)
  }

  const langEntries = Object.entries(info.languages).sort((a, b) => b[1] - a[1])
  if (langEntries.length > 0) {
    items.push(`**Languages:** ${langEntries.map(([l, p]) => `${l} ${p}%`).join(', ')}`)
  }

  for (const item of items) {
    if (item !== null) lines.push(`- ${item}`)
  }
  lines.push('')

  return lines
}

function releaseItem(snap: RepositorySnapshot): string | null {
  const { release } = snap
  if (!release) return null
  if (release.status === 'not_found') return '**Release:** none'

  const canLink = canExposeRepoName(snap)
  const parts: string[] = []
  const tag = release.tag_name ?? '?'
  if (canLink && release.html_url) parts.push(`[\`${tag}\`](${release.html_url})`)
  else parts.push(`\`${tag}\``)

  if (release.tag_sha) {
    const short = release.tag_sha.slice(0, 7)
    const sha = canLink
      ? `[\`${short}\`](https://github.com/${snap.full_name}/commit/${release.tag_sha})`
      : `\`${short}\``
    parts.push(sha)
  }
  if (release.published_at) parts.push(release.published_at.slice(0, 10))

  return `**Release:** ${parts.join(' - ')}`
}

// Collapse whitespace (including newlines) to single spaces and cap length.
// Prevents a description with embedded newlines from breaking the Markdown structure.
function sanitizeDescription(s: string): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > 300 ? `${collapsed.slice(0, 297)}...` : collapsed
}

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

function checkRows(snap: RepositorySnapshot): string[] {
  const rows: string[] = []

  if (snap.policy.repository !== 'not_applicable') {
    const detail =
      snap.policy.repository === 'failed'
        ? `\`${snap.default_branch}\` is not an allowed branch name`
        : `\`${snap.default_branch}\``
    rows.push(`| Default Branch | ${STATUS_LABEL[snap.policy.repository]} | ${detail} |`)
  }

  if (snap.pull_requests !== undefined) {
    const count = snap.pull_requests.open_count
    const detail = count === 0 ? 'No open PRs' : `${count} open PR${count > 1 ? 's' : ''}`
    rows.push(`| Pull Requests | ${STATUS_LABEL[snap.policy.pull_requests]} | ${detail} |`)
  } else if ('pull_requests' in snap.probes) {
    rows.push(`| Pull Requests | ${STATUS_LABEL.unknown} | unreadable |`)
  }

  if (snap.release !== undefined) {
    rows.push(`| Latest Release | ${STATUS_LABEL[snap.policy.release]} | ${releaseLineDetail(snap)} |`)
  } else if ('latest_release' in snap.probes) {
    rows.push(`| Latest Release | ${STATUS_LABEL.unknown} | unreadable |`)
  }

  if (snap.workflows !== undefined) {
    const wf = snap.workflows
    let detail: string
    if (snap.policy.workflow_health === 'unknown') {
      detail = 'no completed runs found'
    } else if (wf.failed_recent_runs > 0) {
      detail = `${wf.failed_recent_runs} of the ${wf.recent_runs_checked} most recent runs failed`
    } else {
      detail = `${wf.recent_runs_checked} most recent runs passed`
    }
    rows.push(`| Workflow Health | ${STATUS_LABEL[snap.policy.workflow_health]} | ${detail} |`)
  } else if ('workflow_runs' in snap.probes) {
    rows.push(`| Workflow Health | ${STATUS_LABEL.unknown} | unreadable |`)
  }

  if (snap.settings !== undefined) {
    const result = snap.policy.settings
    let detail: string
    if (result === 'ok') {
      detail = 'all checks passed'
    } else if (result === 'failed') {
      const vs = snap.policy.settings_violations
      detail = vs.map((v) => `\`${v.key}\``).join(', ')
    } else if (result === 'unknown') {
      detail = 'probe unavailable'
    } else {
      detail = 'not evaluated'
    }
    rows.push(`| Settings | ${STATUS_LABEL[result]} | ${detail} |`)
  } else if ('settings' in snap.probes) {
    rows.push(`| Settings | ${STATUS_LABEL.unknown} | unreadable |`)
  }

  if (snap.rulesets !== undefined) {
    const names = snap.rulesets.active_branch_ruleset_names
    let detail: string
    if (names.length === 0) {
      detail = 'no active branch rulesets'
    } else {
      detail = names
        .map((n) => {
          const v = snap.policy.rulesets_violations.find((x) => x.ruleset === n)
          if (v) return `\`${n}\`: missing ${v.missing_rules.join(', ')}`
          return `\`${n}\`: passed`
        })
        .join(' | ')
    }
    rows.push(`| Rulesets | ${STATUS_LABEL[snap.policy.rulesets]} | ${detail} |`)
  } else if ('rulesets' in snap.probes) {
    rows.push(`| Rulesets | ${STATUS_LABEL.not_applicable} | unreadable |`)
  }

  if (snap.security_findings !== undefined) {
    const sf = snap.security_findings
    const detail =
      sf.status === 'not_configured'
        ? 'not configured'
        : sf.open_count === 0
          ? 'no open alerts'
          : `${sf.open_count} open alert${sf.open_count !== 1 ? 's' : ''}`
    rows.push(`| Security Findings | ${STATUS_LABEL[snap.policy.security_findings]} | ${detail} |`)
  } else if ('security_findings' in snap.probes) {
    rows.push(`| Security Findings | ${STATUS_LABEL.unknown} | probe unavailable |`)
  }

  return rows
}

function releaseLineDetail(snap: RepositorySnapshot): string {
  const r = snap.release!
  if (r.status === 'not_found') return 'none'

  const parts: string[] = []

  // :rotating_light: flags a tag commit no longer reachable from the default branch.
  if (r.in_default_branch === false) parts.push(':rotating_light:')

  if (r.tag_sha) {
    const short = r.tag_sha.slice(0, 7)
    const sha = canExposeRepoName(snap)
      ? `[\`${short}\`](https://github.com/${snap.full_name}/commit/${r.tag_sha})`
      : `\`${short}\``
    parts.push(`${sha} ${signIcon(r.commit_verified)}`)
  }

  if (r.tag_sha) parts.push('@')

  const tag = r.tag_name ?? '?'
  const tagLink = canExposeRepoName(snap) && r.html_url ? `[\`${tag}\`](${r.html_url})` : `\`${tag}\``
  if (r.tag_verified !== undefined) {
    parts.push(`${tagLink} ${signIcon(r.tag_verified)}`)
  } else {
    parts.push(tagLink)
  }

  if (r.published_at) parts.push(`- ${r.published_at.slice(0, 10)}`)

  return parts.join(' ')
}

function signIcon(verified: boolean | undefined): string {
  if (verified === undefined) return ''
  return verified ? '(:lock: signed)' : '(:warning: **unsigned**)'
}

// Matches Dependabot auto-generated run names like "npm_and_yarn in /. - Update #1400188885".
const DEPENDABOT_RUN = /\bin\s+\S+\s+-\s+Update\s+#\d+$/

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function workflowTable(runs: WorkflowRun[], recentCount: number): string {
  const filtered = runs.filter((r) => !DEPENDABOT_RUN.test(r.workflow) && r.conclusion !== 'skipped')
  if (filtered.length === 0) return ''

  // Group by workflow name, preserving insertion order.
  const groups = new Map<string, WorkflowRun[]>()
  for (const r of filtered) {
    const lane = groups.get(r.workflow)
    if (!lane) groups.set(r.workflow, [r])
    else lane.push(r)
  }

  const parts: string[] = []
  parts.push(`**Workflow runs** (${recentCount} most recent evaluated for health):\n`)

  for (const [wfName, wfRuns] of groups) {
    // Runs arrive newest-first from the API -- keep that order (newest = left, oldest = right).
    const headers = wfRuns.map((r) => fmtRunDate(r.created_at))
    const cells = wfRuns.map(
      (r) =>
        `[${conclusionIcon(r.conclusion)} ${fmtDur(r.run_started_at ?? r.created_at, r.updated_at)}](${r.html_url})`,
    )

    parts.push(`**${wfName}**\n`)
    parts.push(`| ${headers.join(' | ')} |`)
    parts.push(`| ${headers.map(() => ':---:').join(' | ')} |`)
    parts.push(`| ${cells.join(' | ')} |\n`)
  }

  return parts.join('\n')
}

function conclusionIcon(conclusion: string | null): string {
  if (conclusion === 'success') return ':white_check_mark:'
  if (conclusion === 'failure') return ':x:'
  if (conclusion === 'timed_out') return ':timer_clock:'
  if (conclusion === 'action_required') return ':warning:'
  if (conclusion === 'cancelled') return '-'
  if (conclusion === null) return ':hourglass:'
  return ':question:'
}

function fmtRunDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]!} ${d.getDate()}`
}

function fmtDur(startIso: string, endIso: string): string {
  const s = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60),
    r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}
