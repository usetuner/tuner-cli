# Tuner CLI

Run [Tuner](https://usetuner.ai) voice-agent simulations from your terminal and your CI, and fail the build when your agent fails its evals.

[![npm](https://img.shields.io/npm/v/@usetuner.ai/cli)](https://www.npmjs.com/package/@usetuner.ai/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![CI](https://github.com/usetuner/tuner-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/usetuner/tuner-cli/actions/workflows/ci.yml)

Runs on Linux and macOS with Node 22 or later. Windows is not supported yet.

## Install

```bash
npm install -g @usetuner.ai/cli
tuner --version
```

Or run it without installing:

```bash
npx @usetuner.ai/cli --help
```

## Get an API key

Create a key in the [Tuner app](https://app.usetuner.ai) under **Settings → API Keys**
([direct link](https://app.usetuner.ai/workspace-api-keys)). The key is shown once, when you
create it. The key belongs to a workspace, and the CLI uses that workspace. See the
[Tuner docs](https://docs.usetuner.ai) for agents, scenarios and evals.

## Quickstart

```bash
tuner auth login                    # paste the key; it is checked, then stored
tuner agents list                   # find your agent's ID
export TUNER_AGENT_ID=<agent-id>
tuner scenarios list --tag smoke    # see what a tag selects
tuner sim run --tag smoke           # run them and wait for the result
```

```text
Workspace: Acme · Agent: Booking (staging) (77)
Running 3 scenarios (run 4821)...
  ✓ passed          Reschedule appointment
  ✓ passed          New booking
  ✗ failed          Refund request   failed evals: Refund policy

2 passed · 1 failed · 0 inconclusive
https://app.usetuner.ai/simulations?agent=77&run=4821
Result: failed (agent_failed)
```

The exit code tells you the outcome. See [Exit codes](#exit-codes).

## Configuration

Each setting is read from the flag, then the environment variable, then the stored file or the
default.

| Setting   | Flag         | Environment variable | Stored file or default                     |
| --------- | ------------ | -------------------- | ------------------------------------------ |
| API key   | `--api-key`  | `TUNER_API_KEY`      | `credentials.json` from `tuner auth login` |
| Agent     | `--agent`    | `TUNER_AGENT_ID`     | none                                       |
| Base URL  | `--base-url` | `TUNER_BASE_URL`     | `https://api.usetuner.ai`                  |
| Workspace | none         | `TUNER_WORKSPACE_ID` | the API key's workspace                    |

- `--agent` and `TUNER_AGENT_ID` take the agent's Agent ID or its numeric ID.
- `TUNER_WORKSPACE_ID` is a guard: if the key belongs to another workspace, the command stops
  with `config_error` (exit 2).
- `NO_COLOR` turns off colored output.
- Where `credentials.json` lives: [`tuner auth login`](docs/commands.md#tuner-auth-login).

## Commands

| Command                  | What it does                                               |
| ------------------------ | ---------------------------------------------------------- |
| `tuner sim run`          | Start a run by `--tag`, `--scenario` or `--suite` and wait |
| `tuner runs get <id>`    | Print a run's status and result                            |
| `tuner runs cancel <id>` | Cancel a run                                               |
| `tuner agents list`      | List the workspace's agents                                |
| `tuner scenarios list`   | List the agent's scenarios (`--tag` to filter)             |
| `tuner suites list`      | List the agent's suites (values for `--suite`)             |
| `tuner profiles list`    | List the agent's test profiles (values for `--profile`)    |
| `tuner languages list`   | List caller languages (values for `--language`)            |
| `tuner noise list`       | List background noises (values for `--noise`)              |
| `tuner auth login`       | Check an API key and store it                              |
| `tuner auth status`      | Show which key is in use and its workspace                 |
| `tuner auth logout`      | Delete the stored key                                      |

Global flags: `--api-key`, `--base-url`, `--verbose`, `-V/--version`, `-h/--help`. Every
command except `auth` takes `--output text|json`.

A few common runs:

```bash
tuner sim run --scenario 311,312                     # specific scenarios
tuner sim run --suite smoke                          # a saved suite with its own settings
tuner sim run --tag smoke --noise cafe --noise-intensity high
tuner sim run --tag smoke --meta commit="$(git rev-parse HEAD)"
tuner sim run --tag smoke --output json > result.json  # JSON on stdout, progress on stderr
RUN_ID=$(tuner sim run --tag smoke --no-wait | head -n 1) && tuner runs get "$RUN_ID"
```

Full flag reference: [docs/commands.md](docs/commands.md). JSON format:
[docs/json-output.md](docs/json-output.md).

## Use in CI

In GitHub Actions, use [`usetuner/tuner-action`](https://github.com/usetuner/tuner-action). It
installs the CLI, runs the simulations and reports the result on the job and the pull request.

```yaml
name: voice-agent-tests
on: [pull_request]

jobs:
  tuner:
    runs-on: ubuntu-latest
    timeout-minutes: 70 # keep above the action's timeout (default 60m)
    steps:
      - uses: usetuner/tuner-action@v1
        with:
          api-key: ${{ secrets.TUNER_API_KEY }}
          agent: ${{ vars.TUNER_AGENT_ID }}
          tag: smoke
```

To call the CLI directly in any CI, set `TUNER_API_KEY` and `TUNER_AGENT_ID` and run it with
`exec`, so a job cancel reaches the CLI and it cancels the run:

```bash
npm install -g @usetuner.ai/cli
exec tuner sim run --tag smoke --timeout 60m --output json > tuner-result.json
```

Details on timeouts, signals and `exec`: [docs/ci.md](docs/ci.md).

## Exit codes

Exit codes are a stable contract.

| Exit | Meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| 0    | Every scenario passed (or the command succeeded)                                             |
| 1    | At least one scenario failed its evals (`reason: agent_failed`)                              |
| 2    | A problem you must fix: bad flag, rejected key, unknown agent/tag/scenario/suite, no credits |
| 3    | Tuner couldn't finish the run: outage, 5xx, rate limited after retries, `--timeout` reached  |
| 130  | Interrupted by SIGINT (Ctrl-C or a canceled CI job); the run was canceled first              |
| 143  | Stopped by SIGTERM; the run was canceled first                                               |

When several apply, the worst wins: 1, then 2, then 3. Every error code and its exit:
[docs/errors.md](docs/errors.md).

## Support

- Questions and bugs: [GitHub issues](https://github.com/usetuner/tuner-cli/issues)
- Email: [support@usetuner.ai](mailto:support@usetuner.ai)
- Security issues: see [SECURITY.md](SECURITY.md), not a public issue

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
