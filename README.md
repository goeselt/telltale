# Telltale

Repository health reporter. Generates a standalone HTML overview of configured GitHub repositories: release status,
workflow health, branch protection rules, settings compliance, and security findings -- grouped into card tiles with
per-repository detail sections, published as a GitHub Pages site.

**Live example:** <https://goeselt.github.io/telltale/>

## Quick Start

```bash
cp .env.example .env
# edit .env: set GITHUB_TOKEN
npm ci
npm run report
# output: overview.html  (open in any browser)
```

## Configuration

Two YAML files under `config/`:

### `config/repositories.yml`

Defines which repositories to include, grouped by name. Each group references a profile.

```yaml
groups:
  - name: personal
    profile: personal-repositories
    owner:
      type: user
      name: your-github-username
    include_archived: false
    include_forks: false
    expose_private_names: true
    exclude: []

  - name: external
    profile: release-watch
    repositories:
      - actions/checkout
```

| Field                  | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `profile`              | Which profile from `profiles.yml` to apply                        |
| `owner`                | Discover repositories dynamically from a user or org account      |
| `repositories`         | Explicit list of `owner/repo` names                               |
| `include_archived`     | Include archived repositories (default `false`)                   |
| `include_forks`        | Include forked repositories (default `false`)                     |
| `expose_private_names` | Show `owner/repo` name for private repositories (default `false`) |
| `exclude`              | List of `owner/repo` names to skip when using `owner` discovery   |

### `config/profiles.yml`

Defines which collectors to run and which policy rules to enforce.

```yaml
profiles:
  personal-repositories:
    collectors:
      repository_info: true
      repository_settings: true
      pull_requests: true
      issues: true
      latest_release: true
      workflow_runs: true
      rulesets: true
      security_findings: true
    rules:
      repository:
        allowed_default_branches: [main]
      settings:
        required:
          delete_branch_on_merge: true
          allow_squash_merge: true
        forbidden:
          allow_merge_commit: true
      workflow_health:
        recent_runs: 5
        fail_on_conclusions: [failure, timed_out, action_required]
      latest_release:
        required: false
        require_in_default_branch: true
      rulesets:
        required_names: [main]
        ruleset_rules:
          main:
            required_rules:
              - deletion
              - non_fast_forward
              - required_signatures
```

See [`config/README.md`](config/README.md) for the full configuration reference.

## CLI Options

| Flag                 | Env var               | Default         | Description                                                |
| -------------------- | --------------------- | --------------- | ---------------------------------------------------------- |
| `--out <path>`       | `TELLTALE_OUTPUT`     | `overview.html` | Output path; use `-` for stdout                            |
| `--config-dir <dir>` | `TELLTALE_CONFIG_DIR` | `config/`       | Directory containing `repositories.yml` and `profiles.yml` |
| `--fixtures <dir>`   | --                    | --              | Use fixture files instead of live GitHub API calls         |

## Scheduled Report Workflow

See `.github/workflows/report.yml`. The workflow generates `overview.html`, commits it back to the repository, and
deploys it to GitHub Pages. It requires:

- `vars.RELEASE_APP_ID` -- GitHub App client ID (needs read access to all monitored repositories)
- `secrets.RELEASE_APP_KEY` -- GitHub App private key
- `vars.RELEASE_SIGNING_USER` / `vars.RELEASE_SIGNING_EMAIL` / `secrets.RELEASE_SIGNING_KEY` -- GPG commit signing
  (required if branch protection enforces signed commits)

### GitHub Pages Setup

Enable Pages in the repository settings once:

1. **Settings --> Pages --> Source**: select **GitHub Actions**
2. Trigger the workflow manually (`Actions --> Report --> Run workflow`) for the first deployment

The page will be available at `https://<owner>.github.io/<repo>/` after the first successful run.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE](LICENSE).
