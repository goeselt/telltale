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

Checks the default branch name and repository visibility against allowlists. The default branch and visibility are
always fetched (from `GET /repos/{owner}/{repo}`) regardless of which collectors are enabled.

```yaml
rules:
  repository:
    allowed_default_branches:
      - main
      - master
    allowed_visibility:
      - private
      - internal
```

Both keys are optional. Omitting a key skips that check. The overall check is `not_applicable` if neither key is set.

---

### rules.settings

Evaluates repository feature flags. Requires `repository_settings: true` in collectors.

API fields come from [GET /repos/{owner}/{repo}](https://docs.github.com/en/rest/repos/repos#get-a-repository) and its
`security_and_analysis` sub-object.

| API Field                                 | GitHub UI Location                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `delete_branch_on_merge`                  | Settings --> General --> Pull Requests --> "Automatically delete head branches"                                            |
| `allow_squash_merge`                      | Settings --> General --> Pull Requests --> "Allow squash merging"                                                          |
| `allow_merge_commit`                      | Settings --> General --> Pull Requests --> "Allow merge commits"                                                           |
| `allow_rebase_merge`                      | Settings --> General --> Pull Requests --> "Allow rebase merging"                                                          |
| `allow_auto_merge`                        | Settings --> General --> Pull Requests --> "Allow auto-merge"                                                              |
| `allow_update_branch`                     | Settings --> General --> Pull Requests --> "Always suggest updating pull request branches"                                 |
| `has_wiki`                                | Settings --> General --> Features --> "Wikis"                                                                              |
| `has_issues`                              | Settings --> General --> Features --> "Issues"                                                                             |
| `has_projects`                            | Settings --> General --> Features --> "Projects"                                                                           |
| `allow_forking`                           | Settings --> General --> "Allow forking" (public repos)                                                                    |
| `web_commit_signoff_required`             | Settings --> General --> "Require contributors to sign off on web-based commits"                                           |
| `allow_all_pr_creation`                   | Settings --> General --> "Allow all users to create pull requests" (derived from `pull_request_creation_policy === "all"`) |
| `secret_scanning_enabled`                 | Settings --> Code security and analysis --> "Secret scanning"                                                              |
| `secret_scanning_push_protection_enabled` | Settings --> Code security and analysis --> "Push protection"                                                              |
| `dependabot_security_updates_enabled`     | Settings --> Code security and analysis --> "Dependabot security updates"                                                  |

```yaml
rules:
  settings:
    required: # field must be true
      delete_branch_on_merge: true
      allow_auto_merge: true
      has_issues: true
    forbidden: # field must be false (value in policy must be true to mark it as forbidden)
      allow_merge_commit: true
      has_wiki: true
```

---

### rules.pull_requests

Evaluates open pull request counts. Requires `pull_requests: true` in collectors.

```yaml
rules:
  pull_requests:
    dependabot_warning_threshold: 3 # warn if >=N Dependabot PRs are open
```

Dependabot PRs are identified by `author_login: "dependabot[bot]"`. The threshold triggers a `warning` status; there is
no separate `failed` state for this check.

---

### rules.rulesets

Checks that named branch rulesets exist, are actively enforced, and contain the required rule types. Requires
`rulesets: true` in collectors.

- `required_names` -- rulesets that must exist (matched by name, case-sensitive).
- `ruleset_rules.<name>.required_rules` -- rule types that must be present in that ruleset.
- `ruleset_rules.<name>.forbidden_rules` -- rule types that must **not** be present.
- `ruleset_rules.<name>.pull_request` -- parameter checks for the `pull_request` rule (see below).

A required ruleset found in **evaluate** (dry-run) mode produces a `warning` instead of `failed`. The report lists it
separately under "Rulesets in evaluate (dry-run) mode".

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
          - merge_queue
        pull_request:
          required_approving_review_count: 1 # fail if fewer than N approvals required
          dismiss_stale_reviews_on_push: true # fail if not enabled
          require_code_owner_review: true # fail if not enabled
          require_last_push_approval: true # fail if not enabled
```

#### pull_request parameter checks

Only evaluated when the `pull_request` rule is listed in `required_rules` and is present in the ruleset. All keys are
optional.

| Key                               | GitHub UI Label (pull request rule settings)                       |
| --------------------------------- | ------------------------------------------------------------------ |
| `required_approving_review_count` | "Required approvals" -- passes if actual value >= configured value |
| `dismiss_stale_reviews_on_push`   | "Dismiss stale reviews when new commits are pushed"                |
| `require_code_owner_review`       | "Require review from Code Owners"                                  |
| `require_last_push_approval`      | "Require approval of the most recent reviewable push"              |

---

### rules.workflow_health

Evaluates recent workflow run conclusions. Requires `workflow_runs: true` in collectors.

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
    recent_runs: 5 # number of recent completed runs to evaluate
    fail_on_conclusions:
      - failure
      - timed_out
      - action_required
```

---

### rules.latest_release

Requires `latest_release: true` in collectors.

```yaml
rules:
  latest_release:
    required: true # fail if no release exists (default: false --> warning)
    require_in_default_branch: true
    # fail if the release tag commit is not reachable from the default branch
    # (tag was force-pushed or moved -- possible sign of supply-chain manipulation)
```

`require_in_default_branch` uses
[GET /repos/{owner}/{repo}/compare/{tag_sha}...{branch}](https://docs.github.com/en/rest/commits/commits#compare-two-commits).
A compare status of `diverged` or `behind` means the tag commit is no longer on the main line of history.
