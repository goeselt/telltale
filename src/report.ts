import type {
  RepositorySnapshot,
  ProbeStatus,
  WorkflowRun,
  SettingsViolation,
  RulesetParameterViolation,
} from './types.ts'

const ICON_OK = '\u2705'
const ICON_WARNING = '\u26A0\uFE0F'
const ICON_FAILED = '\u274C'
const ICON_UNKNOWN = '\u2754'
const ICON_ALERT = '\u{1F6A8}'
const ICON_LOCK = '\u{1F512}'
const ICON_TIMER = '\u23F1\uFE0F'
const ICON_PENDING = '\u23F3'
const ICON_QUESTION = '\u2753'
const ICON_EXTERNAL = '&#x2197;'

const STATUS_ICON: Record<ProbeStatus, string> = {
  ok: ICON_OK,
  warning: ICON_WARNING,
  failed: ICON_FAILED,
  unknown: ICON_UNKNOWN,
  not_applicable: '--',
}

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  font-size:16px;line-height:1.6;color:#24292f;background:#f6f8fa;
  padding:24px 16px 48px
}
.container{max-width:1100px;margin:0 auto}
a{color:#0969da;text-decoration:none}

/* header */
h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
.generated{color:#656d76;font-size:.82rem;margin-bottom:32px}

/* card grid */
.group-label{
  font-size:.72rem;font-weight:600;text-transform:uppercase;
  letter-spacing:.06em;color:#656d76;margin:28px 0 8px
}
.group-label:first-of-type{margin-top:0}
.card-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:8px;margin-bottom:4px
}
.card{
  border-radius:8px;border:2px solid;padding:14px 16px;
  text-decoration:none;display:block;color:inherit;transition:filter .1s
}
.card:hover{filter:brightness(.92)}
.card.ok    {background:#ecf7ed;border-color:#27a641;--c:#0e4421;--m:#2d7a4f}
.card.warning{background:#fef9e7;border-color:#d4a017;--c:#6b4600;--m:#9a6800}
.card.failed {background:#fdf0e6;border-color:#c95e00;--c:#7a2d00;--m:#9a4800}
.card.unknown{background:#f5f5f5;border-color:#9e9e9e;--c:#424242;--m:#757575}
.card-name{
  font-weight:700;font-size:.92em;color:var(--c);margin-bottom:8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
.card-body{font-size:.8em;line-height:1.8;color:var(--c)}
.card-body .muted{color:var(--m)}

/* detail articles */
.details{margin-top:40px}
article{
  background:#fff;border:1px solid #d0d7de;border-radius:8px;
  padding:20px 24px;margin-bottom:12px
}
h2.repo-heading{
  font-size:.95rem;font-weight:700;margin-bottom:14px;
  display:flex;align-items:center;gap:8px
}
/* description */
blockquote.desc{
  margin:0 0 14px;padding:8px 12px;
  border-left:3px solid #d0d7de;
  color:#656d76;font-size:.87em;font-style:italic
}
blockquote.desc a{color:#0969da;font-style:normal}

/* meta list */
dl.meta{display:grid;grid-template-columns:180px 1fr;margin:0 0 16px;font-size:.84em}
dl.meta dt{font-weight:600;color:#656d76;white-space:normal;overflow-wrap:break-word;padding:3px 16px 3px 6px}
dl.meta dd{margin:0;padding:3px 6px}
dl.meta>:nth-child(4n+3),dl.meta>:nth-child(4n){background:#f9fafb}
dl.meta.single>dt{grid-column:1/-1;background:none}
dl.meta.single>dt:nth-child(even){background:#f9fafb}

/* meta+checks shared column alignment */
.meta-section{display:grid;grid-template-columns:max-content 1fr}
.meta-section>blockquote.desc,.meta-section>p.section-title{grid-column:1/-1}
.meta-section>dl.meta{grid-column:1/-1}

/* section title (checks, workflow runs) */
.section-title{
  font-weight:600;color:#656d76;font-size:.75rem;
  text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px
}

/* workflow runs */
.wf-runs{font-size:.84em;margin-top:12px}
.wf-lanes{display:grid;grid-template-columns:180px 1fr;align-items:start;gap:6px 0}
.wf-lane-name{font-weight:600;color:#656d76;padding:3px 16px 3px 6px}
.wf-lane-info{font-weight:400;color:#656d76;font-size:.85em}
.wf-cells{display:flex;gap:3px;flex-wrap:wrap;padding:3px 6px}
.wf-cell{
  font-size:.82em;padding:2px 7px;border-radius:4px;text-decoration:none;
  color:#24292f;border:1px solid transparent;white-space:nowrap;transition:filter .1s
}
.wf-cell:hover{filter:brightness(.92)}
.wf-cell.ok      {background:#e6f4ea;border-color:#81c784}
.wf-cell.fail    {background:#fce8e6;border-color:#e57373}
.wf-cell.timeout {background:#fff3e0;border-color:#ffb74d}
.wf-cell.action  {background:#fff8e1;border-color:#ffd54f}
.wf-cell.cancel  {background:#f5f5f5;border-color:#bdbdbd;color:#757575}
.wf-cell.pending {background:#e8eaf6;border-color:#9fa8da}
.wf-cell.other{opacity:.5;border-style:dashed}

/* violations */
.violations{margin-top:14px}

`

// --- public API ---

export function renderReport(snapshots: RepositorySnapshot[], generatedAt: string): string {
  const parts: string[] = []
  parts.push(renderCardGrid(snapshots))
  parts.push('<div class="details">')
  for (const snap of snapshots) parts.push(renderDetail(snap))

  const gapRows = snapshots.flatMap((s) =>
    Object.entries(s.probes).map(
      ([k, p]) => `<dt>${esc(displayName(s))} &middot; ${esc(k)}</dt><dd>${esc(p.reason)}</dd>`,
    ),
  )
  if (gapRows.length > 0) {
    parts.push('<article>')
    parts.push(`<h2 class="repo-heading"><span>${ICON_WARNING}</span><span>Permission Gaps</span></h2>`)
    parts.push('<dl class="meta">')
    parts.push(...gapRows)
    parts.push('</dl>')
    parts.push('</article>')
  }

  parts.push('</div>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Repository Overview</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
<h1>Repository Overview</h1>
<p class="generated">Generated: ${esc(generatedAt)}</p>
${parts.join('\n')}
</div>
</body>
</html>
`
}

export function renderCardGrid(snapshots: RepositorySnapshot[]): string {
  const groups = new Map<string, RepositorySnapshot[]>()
  for (const s of snapshots) {
    const g = groups.get(s.group)
    if (!g) groups.set(s.group, [s])
    else g.push(s)
  }

  const parts: string[] = []
  for (const [groupName, snaps] of groups) {
    const n = snaps.length
    parts.push(`<p class="group-label">${esc(groupName)} (${n} repo${n !== 1 ? 's' : ''})</p>`)
    parts.push('<div class="card-grid">')
    for (const s of snaps) parts.push(renderCard(s))
    parts.push('</div>')
  }
  return parts.join('\n')
}

export function renderDetail(snap: RepositorySnapshot): string {
  const anchor = repoAnchor(snap)
  const headingName = canExposeRepoName(snap) ? snap.full_name : '[private]'
  const parts: string[] = []

  parts.push(`<article id="${anchor}">`)
  parts.push(
    `<h2 class="repo-heading"><span>${STATUS_ICON[snap.policy.overall]}</span><span>${esc(headingName)}</span></h2>`,
  )

  const checks = checkRows(snap)
  if (snap.info || checks.length > 0) {
    parts.push('<div class="meta-section">')
    if (snap.info) parts.push(infoBlock(snap))
    if (checks.length > 0) {
      parts.push('<p class="section-title">Health Checks</p>')
      parts.push('<dl class="meta">')
      for (const c of checks) {
        parts.push(`<dt>${esc(c.name)}</dt><dd>${c.icon ?? STATUS_ICON[c.status]} ${c.detail}</dd>`)
      }
      parts.push('</dl>')
    }
    parts.push('</div>')
  }

  if (snap.workflows && snap.workflows.runs.length > 0) {
    parts.push(workflowSection(snap.workflows.runs, snap.workflows.recent_runs_checked))
  }

  if (snap.policy.settings === 'failed' && snap.policy.settings_violations.length > 0) {
    parts.push('<div class="violations"><h3 class="section-title">Settings violations</h3>')
    parts.push('<dl class="meta">')
    for (const v of snap.policy.settings_violations) {
      const [key, action] = settingsViolationParts(v)
      parts.push(`<dt>${esc(key)}</dt><dd>${action}</dd>`)
    }
    parts.push('</dl></div>')
  }

  if (snap.policy.rulesets_missing.length > 0) {
    parts.push('<div class="violations"><h3 class="section-title">Missing rulesets</h3>')
    parts.push('<dl class="meta">')
    for (const name of snap.policy.rulesets_missing) {
      parts.push(`<dt>${esc(name)}</dt><dd>required but not found</dd>`)
    }
    parts.push('</dl></div>')
  }

  if (snap.policy.rulesets_evaluate_mode.length > 0) {
    parts.push('<div class="violations"><h3 class="section-title">Rulesets in evaluate (dry-run) mode</h3>')
    parts.push('<dl class="meta">')
    for (const name of snap.policy.rulesets_evaluate_mode) {
      parts.push(`<dt>${esc(name)}</dt><dd>not enforced; set enforcement to active</dd>`)
    }
    parts.push('</dl></div>')
  }

  if (snap.policy.rulesets_violations.length > 0) {
    parts.push('<div class="violations"><h3 class="section-title">Ruleset rule violations</h3>')
    parts.push('<dl class="meta">')
    for (const v of snap.policy.rulesets_violations) {
      for (const r of v.missing_rules) {
        const [key, action] = ruleViolationParts(r, 'add', v.ruleset)
        parts.push(`<dt>${esc(key)}</dt><dd>${action}</dd>`)
      }
      for (const r of v.forbidden_rules) {
        const [key, action] = ruleViolationParts(r, 'remove', v.ruleset)
        parts.push(`<dt>${esc(key)}</dt><dd>${action}</dd>`)
      }
      for (const pv of v.parameter_violations) {
        const [key, action] = paramViolationParts(pv, v.ruleset)
        parts.push(`<dt>${esc(key)}</dt><dd>${action}</dd>`)
      }
    }
    parts.push('</dl></div>')
  }

  parts.push('</article>')
  return parts.join('\n')
}

// --- card helpers ---

function renderCard(snap: RepositorySnapshot): string {
  const anchor = repoAnchor(snap)
  const name = canExposeRepoName(snap) ? snap.full_name : '[private]'
  const status = snap.policy.overall
  const rows: string[] = []

  if (snap.release !== undefined) {
    if (snap.release.status === 'not_found') {
      rows.push('no release')
    } else {
      const r = snap.release
      const parts = [`Release <strong>${esc(r.tag_name ?? '?')}</strong>`]
      if (r.tag_sha) parts.push(r.tag_sha.slice(0, 7))
      rows.push(parts.join(' &middot; '))
    }
  }

  if (snap.info?.last_commit_sha) {
    rows.push(`HEAD ${snap.info.last_commit_sha.slice(0, 7)}`)
  }

  const metaParts: string[] = []
  if (snap.info?.branch_count !== undefined)
    metaParts.push(`${snap.info.branch_count} branch${snap.info.branch_count !== 1 ? 'es' : ''}`)
  if (snap.pull_requests !== undefined) {
    const n = snap.pull_requests.open_count
    metaParts.push(`${n} PR${n !== 1 ? 's' : ''}`)
  }
  if (snap.issues !== undefined) {
    const n = snap.issues.open_count
    metaParts.push(`${n} issue${n !== 1 ? 's' : ''}`)
  }
  if (metaParts.length > 0) rows.push(`<span class="muted">${metaParts.join(' &middot; ')}</span>`)

  if (snap.info) {
    const top2 = Object.entries(snap.info.languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
    if (top2.length > 0)
      rows.push(`<span class="muted">${top2.map(([l, p]) => `${esc(l)} ${p}%`).join(' &middot; ')}</span>`)
  }

  return `<a href="#${anchor}" class="card ${status}">
<div class="card-name" title="${esc(name)}">${esc(name)}</div>
<div class="card-body">${rows.join('<br>\n')}</div>
</a>`
}

// --- detail helpers ---

function infoBlock(snap: RepositorySnapshot): string {
  const info = snap.info!
  const canLink = canExposeRepoName(snap)
  const parts: string[] = []

  const rawDesc = info.description ? sanitizeDescription(info.description) : null
  const descContent = rawDesc ? esc(rawDesc) : '<em>no description</em>'
  if (canLink) {
    parts.push(
      `<blockquote class="desc">${descContent} <a href="https://github.com/${snap.full_name}" title="Open on GitHub">${ICON_EXTERNAL}</a></blockquote>`,
    )
  } else {
    parts.push(`<blockquote class="desc">${descContent}</blockquote>`)
  }

  const items: Array<[string, string]> = []

  if (info.last_commit_at) {
    const date = info.last_commit_at.slice(0, 10)
    if (info.last_commit_sha) {
      const short = info.last_commit_sha.slice(0, 7)
      const shaLink = canLink
        ? `<a href="https://github.com/${snap.full_name}/commit/${info.last_commit_sha}">${short}</a>`
        : short
      const lock = signIcon(info.last_commit_verified)
      const sha = lock ? `${shaLink} ${lock}` : shaLink
      items.push(['HEAD', `${esc(snap.default_branch)} &middot; ${sha} &middot; ${esc(date)}`])
    } else {
      items.push(['HEAD', `${esc(snap.default_branch)} &middot; ${esc(date)}`])
    }
  } else {
    items.push(['HEAD', esc(snap.default_branch)])
  }

  const ri = releaseMetaItem(snap)
  if (ri) items.push(ri)

  if (info.license) items.push(['License', esc(info.license)])
  items.push(['Visibility', esc(snap.visibility)])
  items.push(['Size', esc(formatSize(info.size_kb))])
  items.push(['Branches', String(info.branch_count)])
  if (snap.pull_requests !== undefined) items.push(['Open PRs', String(snap.pull_requests.open_count)])
  if (snap.issues !== undefined) items.push(['Open Issues', String(snap.issues.open_count)])

  const langEntries = Object.entries(info.languages).sort((a, b) => b[1] - a[1])
  if (langEntries.length > 0) items.push(['Languages', langEntries.map(([l, p]) => `${esc(l)} ${p}%`).join(', ')])

  const dtDds = items.map(([dt, dd]) => `<dt>${esc(dt)}</dt><dd>${dd}</dd>`).join('\n')
  parts.push(`<dl class="meta">\n${dtDds}\n</dl>`)

  return parts.join('\n')
}

function releaseMetaItem(snap: RepositorySnapshot): [string, string] | null {
  const { release } = snap
  if (!release) return null
  if (release.status === 'not_found') return ['Release', 'none']

  const canLink = canExposeRepoName(snap)
  const parts: string[] = []
  const tag = release.tag_name ?? '?'

  const tagLink = canLink && release.html_url ? `<a href="${release.html_url}">${esc(tag)}</a>` : esc(tag)
  const tagLock = signIcon(release.tag_verified)
  parts.push(tagLock ? `${tagLink} ${tagLock}` : tagLink)

  if (release.tag_sha) {
    const short = release.tag_sha.slice(0, 7)
    const shaLink = canLink
      ? `<a href="https://github.com/${snap.full_name}/commit/${release.tag_sha}">${short}</a>`
      : short
    const shaLock = signIcon(release.commit_verified)
    parts.push(shaLock ? `${shaLink} ${shaLock}` : shaLink)
  }
  if (release.published_at) parts.push(esc(release.published_at.slice(0, 10)))

  return ['Release', parts.join(' &middot; ')]
}

function checkRows(
  snap: RepositorySnapshot,
): Array<{ name: string; status: ProbeStatus; detail: string; icon?: string }> {
  const rows: Array<{ name: string; status: ProbeStatus; detail: string; icon?: string }> = []

  function add(name: string, status: ProbeStatus, detail: string, icon?: string): void {
    rows.push({ name, status, detail, icon })
  }

  if (snap.policy.repository !== 'not_applicable') {
    const detail =
      snap.policy.repository === 'ok'
        ? esc(snap.default_branch)
        : `${esc(snap.default_branch)} &middot; ${esc(snap.visibility)}`
    add('Default Branch', snap.policy.repository, detail)
  }

  if (snap.pull_requests !== undefined) {
    const count = snap.pull_requests.open_count
    const depCount = snap.pull_requests.dependabot_count
    let detail = count === 0 ? 'No open PRs' : `${count} open PR${count > 1 ? 's' : ''}`
    if (depCount > 0) detail += ` (${depCount} dependabot)`
    add('Pull Requests', snap.policy.pull_requests, detail)
  } else if ('pull_requests' in snap.probes) {
    add('Pull Requests', 'unknown', 'unreadable')
  }

  if (snap.release !== undefined) {
    add('Latest Release', snap.policy.release, releaseLineDetail(snap))
  } else if ('latest_release' in snap.probes) {
    add('Latest Release', 'unknown', 'unreadable')
  }

  if (snap.workflows !== undefined) {
    const wf = snap.workflows
    let detail: string
    const branch = snap.default_branch
    if (snap.policy.workflow_health === 'unknown') detail = 'no completed runs found'
    else if (wf.failed_recent_runs > 0)
      detail = `${wf.failed_recent_runs} of the ${wf.recent_runs_checked} most recent runs on ${branch} failed`
    else detail = `${wf.recent_runs_checked} most recent runs on ${branch} passed`
    add('Workflow Health', snap.policy.workflow_health, detail)
  } else if ('workflow_runs' in snap.probes) {
    add('Workflow Health', 'unknown', 'unreadable')
  }

  if (snap.settings !== undefined) {
    const result = snap.policy.settings
    let detail: string
    if (result === 'ok') detail = 'all checks passed'
    else if (result === 'failed') {
      const n = snap.policy.settings_violations.length
      detail = `${n} finding${n !== 1 ? 's' : ''}`
    } else if (result === 'unknown') detail = 'probe unavailable'
    else detail = 'not evaluated'
    add('Settings', result, detail)
  } else if ('settings' in snap.probes) {
    add('Settings', 'unknown', 'unreadable')
  }

  if (snap.rulesets !== undefined) {
    const names = snap.rulesets.active_branch_ruleset_names
    let detail: string
    if (names.length === 0) {
      detail = 'no active branch rulesets'
    } else if (snap.policy.rulesets_evaluate_mode.length > 0 && snap.policy.rulesets_violations.length === 0) {
      detail = `${snap.policy.rulesets_evaluate_mode.length} in evaluate mode`
    } else if (snap.policy.rulesets_violations.length === 0 && snap.policy.rulesets_evaluate_mode.length === 0) {
      detail = 'all checks passed'
    } else {
      const n = snap.policy.rulesets_violations.reduce(
        (s, v) => s + v.missing_rules.length + v.forbidden_rules.length + v.parameter_violations.length,
        0,
      )
      detail = `${n} finding${n !== 1 ? 's' : ''}`
    }
    add('Rulesets', snap.policy.rulesets, detail)
  } else if ('rulesets' in snap.probes) {
    add('Rulesets', 'not_applicable', 'unreadable')
  }

  if (snap.security_findings !== undefined) {
    const sf = snap.security_findings
    const detail =
      sf.status === 'not_configured'
        ? 'not configured'
        : sf.open_count === 0
          ? 'no open alerts'
          : `${sf.open_count} open alert${sf.open_count !== 1 ? 's' : ''}`
    add(
      'Security Findings',
      snap.policy.security_findings,
      detail,
      sf.status === 'not_configured' ? ICON_WARNING : undefined,
    )
  } else if ('security_findings' in snap.probes) {
    add('Security Findings', 'unknown', 'probe unavailable')
  }

  return rows
}

function workflowSection(runs: WorkflowRun[], recentCount: number): string {
  const visible = runs.filter((r) => r.conclusion !== 'skipped')
  if (visible.length === 0) return ''

  const depRuns = visible.filter((r) => DEPENDABOT_RUN.test(r.workflow))
  const otherRuns = visible.filter((r) => !DEPENDABOT_RUN.test(r.workflow))

  const groups = new Map<string, WorkflowRun[]>()
  for (const r of otherRuns) {
    const lane = groups.get(r.workflow)
    if (!lane) groups.set(r.workflow, [r])
    else lane.push(r)
  }

  if (groups.size === 0 && depRuns.length === 0) return ''

  const parts: string[] = []
  parts.push('<div class="wf-runs">')
  parts.push(`<p class="section-title">Workflow runs (${recentCount} most recent evaluated for health)</p>`)
  parts.push('<div class="wf-lanes">')

  for (const [wfName, wfRuns] of groups) {
    parts.push(`<span class="wf-lane-name">${esc(wfName)}</span>`)
    parts.push('<div class="wf-cells">')
    for (const r of wfRuns.slice(0, 20)) {
      const icon = conclusionIcon(r.conclusion)
      const cls = conclusionClass(r.conclusion)
      const otherCls = r.is_main ? '' : ' other'
      const dur = fmtDur(r.run_started_at ?? r.created_at, r.updated_at)
      parts.push(
        `<a href="${r.html_url}" class="wf-cell ${cls}${otherCls}" title="${runTooltipTitle(r)}">${icon} ${esc(dur)}</a>`,
      )
    }
    parts.push('</div>')
  }

  if (depRuns.length > 0) {
    parts.push('<span class="wf-lane-name">Dependabot <span class="wf-lane-info">(info)</span></span>')
    parts.push('<div class="wf-cells">')
    for (const r of depRuns.slice(0, 20)) {
      const icon = conclusionIcon(r.conclusion)
      const cls = conclusionClass(r.conclusion)
      const dur = fmtDur(r.run_started_at ?? r.created_at, r.updated_at)
      const label = r.workflow.replace(DEPENDABOT_RUN, '').trim()
      parts.push(
        `<a href="${r.html_url}" class="wf-cell ${cls}" title="${esc(label)} &middot; ${esc(fmtRunDate(r.created_at))}">${icon} ${esc(dur)}</a>`,
      )
    }
    parts.push('</div>')
  }

  parts.push('</div></div>')
  return parts.join('\n')
}

function conclusionClass(conclusion: string | null): string {
  if (conclusion === 'success') return 'ok'
  if (conclusion === 'failure') return 'fail'
  if (conclusion === 'timed_out') return 'timeout'
  if (conclusion === 'action_required') return 'action'
  if (conclusion === 'cancelled') return 'cancel'
  if (conclusion === null) return 'pending'
  return ''
}

function releaseLineDetail(snap: RepositorySnapshot): string {
  const r = snap.release!
  if (r.status === 'not_found') return 'none'

  const canLink = canExposeRepoName(snap)
  const parts: string[] = []

  if (r.in_default_branch === false) parts.push(ICON_ALERT)

  if (r.tag_sha) {
    const short = r.tag_sha.slice(0, 7)
    const sha = canLink ? `<a href="https://github.com/${snap.full_name}/commit/${r.tag_sha}">${short}</a>` : short
    const sign = signIcon(r.commit_verified)
    parts.push(sign ? `${sha} ${sign}` : sha)
    parts.push('@')
  }

  const tag = r.tag_name ?? '?'
  const tagLink = canLink && r.html_url ? `<a href="${r.html_url}">${esc(tag)}</a>` : esc(tag)
  const tagSign = signIcon(r.tag_verified)
  parts.push(tagSign ? `${tagLink} ${tagSign}` : tagLink)

  if (r.published_at) parts.push(`&middot; ${esc(r.published_at.slice(0, 10))}`)

  return parts.join(' ')
}

// --- shared helpers ---

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

function canExposeRepoName(snap: RepositorySnapshot): boolean {
  return snap.visibility === 'public' || snap.expose_private_name
}

function displayName(snap: RepositorySnapshot): string {
  if (!canExposeRepoName(snap)) return '[private]'
  return snap.full_name
}

function sanitizeDescription(s: string): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > 300 ? `${collapsed.slice(0, 297)}...` : collapsed
}

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

function signIcon(verified: boolean | undefined): string {
  return verified === true ? ICON_LOCK : ''
}

const DEPENDABOT_RUN = /- Update #\d+$/

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

const TARGET_MAX = 30

function triggerType(event: string, headBranch: string | null, isMain: boolean): string {
  if (event === 'schedule') return 'schedule'
  if (event === 'pull_request') return isMain ? 'pull_request merge' : 'pull_request iteration'
  if (event === 'push' && headBranch && /^v\d/.test(headBranch)) return 'push tag'
  return event
}

function truncTarget(branch: string | null): string {
  if (!branch) return '?'
  return branch.length > TARGET_MAX ? `${branch.slice(0, TARGET_MAX - 1)}...` : branch
}

function runTooltipTitle(r: WorkflowRun): string {
  return [
    esc(triggerType(r.event, r.head_branch, r.is_main)),
    esc(truncTarget(r.head_branch)),
    esc(fmtRunDate(r.created_at)),
  ].join(' &middot; ')
}

function conclusionIcon(conclusion: string | null): string {
  if (conclusion === 'success') return ICON_OK
  if (conclusion === 'failure') return ICON_FAILED
  if (conclusion === 'timed_out') return ICON_TIMER
  if (conclusion === 'action_required') return ICON_WARNING
  if (conclusion === 'cancelled') return '--'
  if (conclusion === null) return ICON_PENDING
  return ICON_QUESTION
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// --- GitHub UI labels ---

const SETTINGS_LABELS: Record<string, string> = {
  has_issues: 'Issues',
  has_projects: 'Projects',
  has_wiki: 'Wikis',
  allow_auto_merge: 'Allow auto-merge',
  delete_branch_on_merge: 'Automatically delete head branches',
  allow_squash_merge: 'Allow squash merging',
  allow_merge_commit: 'Allow merge commits',
  allow_rebase_merge: 'Allow rebase merging',
  allow_all_pr_creation: 'Allow all users to create pull requests',
  secret_scanning_enabled: 'Secret scanning',
  secret_scanning_push_protection_enabled: 'Secret scanning push protection',
  dependabot_security_updates_enabled: 'Dependabot security updates',
  web_commit_signoff_required: 'Require web commit sign-off',
  allow_forking: 'Allow forking',
  allow_update_branch: 'Always suggest updating pull request branches',
}

const RULESET_RULE_LABELS: Record<string, string> = {
  deletion: 'Restrict deletions',
  non_fast_forward: 'Block force pushes',
  required_signatures: 'Require signed commits',
  pull_request: 'Require a pull request before merging',
  required_status_checks: 'Require status checks to pass',
  required_linear_history: 'Require linear history',
  merge_queue: 'Require merge queue',
  workflows: 'Require workflows to pass',
  code_scanning: 'Require code scanning results',
  creation: 'Restrict creations',
  update: 'Restrict updates',
  required_deployments: 'Require deployments to succeed',
}

const PULL_REQUEST_PARAM_LABELS: Record<string, string> = {
  required_approving_review_count: 'Required approvals',
  dismiss_stale_reviews_on_push: 'Dismiss stale reviews on push',
  require_code_owner_review: 'Require review from Code Owners',
  require_last_push_approval: 'Require approval of the most recent reviewable push',
}

// Returns [dt_label, dd_html] -- dt_label is the human-readable label; dd_html may contain HTML
// entities and must not be re-escaped by the caller.
function settingsViolationParts(v: SettingsViolation): [string, string] {
  const label = SETTINGS_LABELS[v.key] ?? v.key
  const action = v.got === false ? 'enable' : 'disable'
  return [label, action]
}

function ruleViolationParts(rule: string, action: 'add' | 'remove', rulesetName: string): [string, string] {
  const label = RULESET_RULE_LABELS[rule] ?? rule
  return [label, `${action} in ruleset:${esc(rulesetName)}`]
}

function paramViolationParts(pv: RulesetParameterViolation, rulesetName: string): [string, string] {
  const paramLabel = pv.rule === 'pull_request' ? (PULL_REQUEST_PARAM_LABELS[pv.param] ?? pv.param) : pv.param
  if (pv.expected === true) {
    return [paramLabel, `enable in ruleset:${esc(rulesetName)}`]
  }
  const expectedStr = String(pv.expected)
  return [paramLabel, `set to ${esc(expectedStr)} in ruleset:${esc(rulesetName)} (currently ${esc(String(pv.got))})`]
}
