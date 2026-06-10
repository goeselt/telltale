# Contributing to Telltale

## Design

| File                      | Responsibility                                                                  |
| ------------------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`            | CLI entry point: argument parsing, config loading, output writing               |
| `src/config.ts`           | YAML config parsing and validation for `repositories.yml` and `profiles.yml`    |
| `src/github/client.ts`    | `GitHubClient` interface -- contract for all GitHub API calls                   |
| `src/github/live.ts`      | Live implementation of `GitHubClient` using the GitHub REST API                 |
| `src/github/fixture.ts`   | Fixture implementation for offline testing                                      |
| `src/collectors/index.ts` | Orchestrates collectors per repository, evaluates policy, emits log lines       |
| `src/collectors/*.ts`     | Individual collectors: repository info, settings, PRs, releases, runs, rulesets |
| `src/policy.ts`           | Policy evaluation: computes `PolicyResult` from a snapshot and a policy config  |
| `src/report.ts`           | Markdown/HTML report renderer: card grid and per-repo detail sections           |
| `src/types.ts`            | Shared data types: snapshots, policy results, probe errors                      |

`src/policy.ts` never calls GitHub. `src/report.ts` never calls GitHub. All API access goes through `GitHubClient`.

## Development Setup

- Node.js 24
- npm

```bash
npm ci
```

Run against live data (requires `GITHUB_TOKEN` in `.env`):

```bash
npm run report
```

Run against fixture data (no token needed):

```bash
npm run report:fixtures
```

## Local Verification

Type check:

```bash
npm run lint
```

Tests:

```bash
npm test
```

## Adding a Fixture

Fixtures live under `fixtures/<owner>-<repo>/`. Each file maps to one `GitHubClient` method:

| File                   | Method                   |
| ---------------------- | ------------------------ |
| `repository.json`      | `getRepository`          |
| `pulls.json`           | `listOpenPullRequests`   |
| `releases-latest.json` | `getLatestRelease`       |
| `tag-<tag>.json`       | `resolveTag`             |
| `actions-runs.json`    | `listRecentWorkflowRuns` |
| `rulesets.json`        | `listRulesets`           |
| `ruleset-<id>.json`    | `getRuleset`             |
| `languages.json`       | `getLanguages`           |
| `last-commit.json`     | `getLastCommit`          |
| `branch-count.json`    | `getBranchCount`         |

## Submitting Changes

Commit messages and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/). The release
pipeline uses the PR title to determine the next version.
