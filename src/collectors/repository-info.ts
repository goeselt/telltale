import type { GitHubClient, GitHubRepository } from '../github/client.ts'
import type { RepositoryInfo, ProbeError } from '../types.ts'

export type RepositoryInfoResult = { ok: true; data: RepositoryInfo } | { ok: false; probe: ProbeError }

export async function collectRepositoryInfo(
  client: GitHubClient,
  owner: string,
  repo: string,
  repoData: GitHubRepository,
  defaultBranch: string,
): Promise<RepositoryInfoResult> {
  try {
    const [langBytes, lastCommit, branchCount] = await Promise.all([
      client.getLanguages(owner, repo),
      client.getLastCommit(owner, repo, defaultBranch),
      client.getBranchCount(owner, repo),
    ])

    const totalBytes = Object.values(langBytes).reduce((s, n) => s + n, 0)
    const languages: Record<string, number> = {}
    if (totalBytes > 0) {
      for (const [lang, bytes] of Object.entries(langBytes)) {
        languages[lang] = Math.round((bytes / totalBytes) * 1000) / 10
      }
    }

    return {
      ok: true,
      data: {
        description: repoData.description,
        size_kb: repoData.size,
        license: repoData.license_spdx,
        languages,
        last_commit_sha: lastCommit?.sha ?? null,
        last_commit_at: lastCommit?.date ?? null,
        branch_count: branchCount,
      },
    }
  } catch (err) {
    return {
      ok: false,
      probe: { status: 'unavailable', reason: err instanceof Error ? err.message : String(err) },
    }
  }
}
