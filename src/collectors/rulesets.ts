import type { GitHubClient } from '../github/client.ts'
import type { RulesetsData, ProbeError } from '../types.ts'

export type RulesetsResult = { ok: true; data: RulesetsData } | { ok: false; probe: ProbeError }

export async function collectRulesets(
  client: GitHubClient,
  owner: string,
  repo: string,
  // Names for which we also fetch the detailed rule list (one extra API call each).
  ruleDetailNames: string[] = [],
): Promise<RulesetsResult> {
  try {
    const rulesets = await client.listRulesets(owner, repo)
    const activeBranch = rulesets.filter(
      (r) => r.enforcement === 'active' && (r.target === 'branch' || r.target == null),
    )
    const evaluateBranch = rulesets.filter(
      (r) => r.enforcement === 'evaluate' && (r.target === 'branch' || r.target == null),
    )

    const named_rules: Record<string, string[]> = {}
    const named_rule_parameters: Record<string, Record<string, Record<string, unknown>>> = {}
    const fetchNames = new Set(ruleDetailNames)
    const toFetch = activeBranch.filter((r) => fetchNames.has(r.name))
    await Promise.all(
      toFetch.map(async (r) => {
        const detail = await client.getRuleset(owner, repo, r.id).catch(() => null)
        named_rules[r.name] = detail?.rules.map((rule) => rule.type) ?? []
        named_rule_parameters[r.name] = {}
        for (const rule of detail?.rules ?? []) {
          if (rule.parameters && Object.keys(rule.parameters).length > 0) {
            named_rule_parameters[r.name][rule.type] = rule.parameters
          }
        }
      }),
    )

    return {
      ok: true,
      data: {
        status: 'ok',
        active_branch_ruleset_names: activeBranch.map((r) => r.name),
        evaluate_branch_ruleset_names: evaluateBranch.map((r) => r.name),
        named_rules,
        named_rule_parameters,
      },
    }
  } catch (err) {
    return { ok: false, probe: { status: 'unavailable', reason: errorReason(err) } }
  }
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { status?: number }
    if (e.status === 403) return 'missing_metadata_read_permission'
    return e.message
  }
  return String(err)
}
