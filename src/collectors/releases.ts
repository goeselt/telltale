import type { GitHubClient } from '../github/client.ts'
import type { ReleaseData, ProbeError } from '../types.ts'

export type ReleaseResult = { ok: true; data: ReleaseData } | { ok: false; probe: ProbeError }

export async function collectRelease(
  client: GitHubClient,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<ReleaseResult> {
  try {
    const release = await client.getLatestRelease(owner, repo)
    if (!release) {
      return { ok: true, data: { status: 'not_found' } }
    }

    const data: ReleaseData = {
      status: 'found',
      tag_name: release.tag_name,
      release_name: release.name ?? release.tag_name,
      published_at: release.published_at ?? undefined,
      html_url: release.html_url,
    }

    // Tag resolution is best-effort; a failure here does not fail the whole collector.
    const tagInfo = await client.resolveTag(owner, repo, release.tag_name, defaultBranch).catch(() => null)
    if (tagInfo) {
      data.tag_sha = tagInfo.commit_sha
      data.tag_verified = tagInfo.tag_verified
      data.tag_verification_reason = tagInfo.tag_verification_reason
      data.commit_verified = tagInfo.commit_verified
      data.commit_verification_reason = tagInfo.commit_verification_reason
      data.in_default_branch = tagInfo.in_default_branch
    }

    return { ok: true, data }
  } catch (err) {
    return { ok: false, probe: { status: 'unavailable', reason: errorReason(err) } }
  }
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { status?: number }
    if (e.status === 403) return 'missing_contents_read_permission'
    return e.message
  }
  return String(err)
}
