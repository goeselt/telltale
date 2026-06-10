import type { GitHubClient } from '../github/client.ts'
import type { SecurityFindingsData, CodeScanningAlert, ProbeError } from '../types.ts'

export type SecurityFindingsResult = { ok: true; data: SecurityFindingsData } | { ok: false; probe: ProbeError }

export async function collectSecurityFindings(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<SecurityFindingsResult> {
  try {
    const result = await client.getCodeScanningAlerts(owner, repo)
    if (result === 'not_configured') {
      return { ok: true, data: { status: 'not_configured', open_count: 0, alerts: [] } }
    }
    const alerts: CodeScanningAlert[] = result.map((a) => ({
      number: a.number,
      rule_id: a.rule_id,
      severity: a.severity,
    }))
    return { ok: true, data: { status: 'enabled', open_count: alerts.length, alerts } }
  } catch (err) {
    return { ok: false, probe: { status: 'unavailable', reason: errorReason(err) } }
  }
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { status?: number }
    if (e.status === 401 || e.status === 403) return 'missing_security_events_permission'
    return e.message
  }
  return String(err)
}
