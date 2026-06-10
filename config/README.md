# Config Reference

Two files configure Telltale.

## repositories.yml

Declares which repositories to monitor and which profile to apply to each group.

```yaml
groups:
  - name: personal # display name used in the report
    profile: default # references a profile in profiles.yml
    repositories:
      - owner/repo-a
      - owner/repo-b
    expose_private_names: false # set true to show full name for private repos
```

## profiles.yml

Defines profiles. Each profile specifies which data to collect (`collectors`) and which rules to evaluate (`rules`).
Both sections live together -- a profile is a single unit.

```yaml
profiles:
  my-profile:
    collectors: { ... }
    rules: { ... }
```

---

### Collectors

| Key                   | What It Fetches                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repository_info`     | Description, size, license, languages, last commit, branch count -- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository) + [List languages](https://docs.github.com/en/rest/repos/repos#list-repository-languages) + [List commits](https://docs.github.com/en/rest/commits/commits#list-commits) + [List branches](https://docs.github.com/en/rest/branches/branches#list-branches) |
| `repository_settings` | Feature flags -- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)                                                                                                                                                                                                                                                                                                                |
| `pull_requests`       | Open PRs -- [List pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)                                                                                                                                                                                                                                                                                                                 |
| `issues`              | Open issues count (derived from repository metadata; does not count pull requests) -- [Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)                                                                                                                                                                                                                                           |
| `latest_release`      | Latest release and tag/commit signatures -- [Get the latest release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)                                                                                                                                                                                                                                                                   |
| `workflow_runs`       | Recent run conclusions -- [List workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository)                                                                                                                                                                                                                                                                        |
| `rulesets`            | Active branch rulesets -- [Get all repository rulesets](https://docs.github.com/en/rest/repos/rules#get-all-repository-rulesets)                                                                                                                                                                                                                                                                                 |
| `security_findings`   | Open code scanning alerts -- [List code scanning alerts](https://docs.github.com/en/rest/code-scanning/code-scanning#list-code-scanning-alerts-for-a-repository). Returns `not_configured` (404/422) or `not_applicable` (missing `security_events` scope).                                                                                                                                                      |

---

### rules.repository

Checks the default branch name against an allowlist. The default branch is always fetched (from
`GET /repos/{owner}/{repo}`) regardless of whether `repository_info` is enabled.

```yaml
rules:
  repository:
    allowed_default_branches:
      - main
      - master
```

If `allowed_default_branches` is omitted, the check is skipped (`not_applicable`).

---

### rules.settings

Evaluates repository feature flags against required (`true`) or forbidden (`true`) values.

API fields come from [GET /repos/{owner}/{repo}](https://docs.github.com/en/rest/repos/repos#get-a-repository).

| API Field                | GitHub UI Label (Settings --> General) |
| ------------------------ | -------------------------------------- |
| `delete_branch_on_merge` | "Automatically delete head branches"   |
| `allow_squash_merge`     | "Allow squash merging"                 |
| `allow_merge_commit`     | "Allow merge commits"                  |
| `allow_rebase_merge`     | "Allow rebase merging"                 |
| `allow_auto_merge`       | "Allow auto-merge"                     |
| `has_wiki`               | "Wikis" (Features section)             |
| `has_issues`             | "Issues" (Features section)            |
| `has_projects`           | "Projects" (Features section)          |

```yaml
rules:
  settings:
    required: # field must be true
      delete_branch_on_merge: true
    forbidden: # field must be false
      allow_merge_commit: true
```

---

### rules.rulesets

Checks that named branch rulesets exist and contain the required rule types.

- `required_names` -- rulesets that must exist (matched by name, case-sensitive).
- `ruleset_rules.<name>.required_rules` -- rule types that must be present in that ruleset.
- `ruleset_rules.<name>.forbidden_rules` -- rule types that must **not** be present in that ruleset.

Rule type values come from the `type` field in
[GET /repos/{owner}/{repo}/rulesets/{ruleset_id}](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset).

| Rule Type                     | GitHub UI Label (Ruleset editor --> Rules) |
| ----------------------------- | ------------------------------------------ |
| `deletion`                    | "Restrict deletions"                       |
| `non_fast_forward`            | "Block force pushes"                       |
| `required_signatures`         | "Require signed commits"                   |
| `pull_request`                | "Require a pull request before merging"    |
| `required_status_checks`      | "Require status checks to pass"            |
| `required_linear_history`     | "Require linear history"                   |
| `merge_queue`                 | "Require merge queue"                      |
| `required_deployments`        | "Require deployments to succeed"           |
| `commit_message_pattern`      | "Require commit message pattern"           |
| `commit_author_email_pattern` | "Require commit author email pattern"      |

```yaml
rules:
  rulesets:
    required_names:
      - main
    ruleset_rules:
      main:
        required_rules:
          - deletion
          - non_fast_forward
          - required_signatures
          - pull_request
          - required_status_checks
        forbidden_rules:
          - required_linear_history
```

---

### rules.workflow_health

Evaluates recent workflow run conclusions.

Conclusion values come from the `conclusion` field in
[GET /repos/{owner}/{repo}/actions/runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository).

| Value             | Meaning                                            |
| ----------------- | -------------------------------------------------- |
| `success`         | All steps passed                                   |
| `failure`         | One or more steps failed                           |
| `timed_out`       | Workflow exceeded its timeout                      |
| `cancelled`       | Manually cancelled                                 |
| `action_required` | Requires manual action (e.g. environment approval) |
| `neutral`         | Non-fatal result                                   |
| `skipped`         | Steps were skipped                                 |
| `stale`           | Workflow became stale without completing           |

```yaml
rules:
  workflow_health:
    recent_runs: 5 # number of recent runs to evaluate
    fail_on_conclusions:
      - failure
      - timed_out
      - action_required
```

---

### rules.latest_release

```yaml
rules:
  latest_release:
    required: true # fail if no release exists (default: false --> warning)
    require_in_default_branch:
      true # fail if the release tag commit is not reachable
      # from the default branch -- tag was force-pushed or moved
```

`require_in_default_branch` uses
[GET /repos/{owner}/{repo}/compare/{tag_sha}...{branch}](https://docs.github.com/en/rest/commits/commits#compare-two-commits).
A compare status of `diverged` or `behind` means the tag commit is no longer on the main line of history -- a possible
sign of supply-chain manipulation or an accidental force-push.
