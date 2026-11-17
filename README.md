# Tuner CLI

Run Tuner voice-agent simulations from the command line and in CI.

> **Status: pre-release.** The CLI is not published to npm yet; install it from source. It
> supports Linux and macOS only. Windows is a known gap.

## Contents

- [Install](#install)
- [Auth and config](#auth-and-config)
- [Quick start](#quick-start)
- [Commands](#commands)
- [How `sim run` behaves](#how-sim-run-behaves)
- [Exit codes](#exit-codes)
- [Error codes](#error-codes)
- [JSON output](#json-output)
- [CI usage](#ci-usage)
- [Development](#development)
- [License](#license)

## Install

You need Node 22 or later.

```sh
git clone https://github.com/usetuner/tuner-cli.git
cd tuner-cli
npm ci
npm run build
npm link        # puts `tuner` on your PATH
tuner --version
```

Without `npm link`, run the built entry point directly: `node dist/cli/main.js --version`.

## Auth and config

The CLI needs a Tuner API key. Store one with `tuner auth login`, or set `TUNER_API_KEY`.

```sh
tuner auth login                               # prompts for the key, hidden
printf '%s' "$TUNER_API_KEY" | tuner auth login  # or pipe it on stdin
tuner auth status                              # which key is in use, and its workspace
tuner auth logout                              # deletes the stored key
```

`auth login` checks the key against the API before it saves it. It reads the key from
`--api-key`, from stdin when stdin is not a terminal, or from a hidden prompt. Prefer stdin or
the prompt: a key passed with `--api-key` ends up in your shell history.

The stored key lives in `credentials.json`, created with mode `0600` (its directory is `0700`):

| OS    | Path                                                                                      |
| ----- | ----------------------------------------------------------------------------------------- |
| macOS | `~/Library/Application Support/tuner/credentials.json`                                    |
| Linux | `$XDG_CONFIG_HOME/tuner/credentials.json`, or `~/.config/tuner/credentials.json` if unset |

### Precedence

Each setting is read from the flag first, then the environment variable, then the stored file
(the API key) or the built-in default. Nothing else is read.

| Setting   | Flag               | Environment variable | Fallback                          |
| --------- | ------------------ | -------------------- | --------------------------------- |
| API key   | `--api-key <key>`  | `TUNER_API_KEY`      | the stored `credentials.json`     |
| Base URL  | `--base-url <url>` | `TUNER_BASE_URL`     | `https://api.usetuner.ai`         |
| Agent     | `--agent <id>`     | `TUNER_AGENT_ID`     | none: commands that need one fail |
| Workspace | none               | `TUNER_WORKSPACE_ID` | none                              |

- `--agent` and `TUNER_AGENT_ID` take the agent's Agent ID (remote identifier) or its numeric
  ID. A value of digits only is read as the numeric ID. `tuner agents list` shows both.
- The workspace always comes from the API key. `TUNER_WORKSPACE_ID` is a safety check: when it
  is set and the key belongs to another workspace, the command stops with `config_error`.

## Quick start

```sh
export TUNER_AGENT_ID=booking-staging          # your agent's Agent ID

tuner scenarios list --tag smoke               # see what a tag selects
tuner sim run --tag smoke                      # run them and wait for the result
tuner sim run --tag smoke --no-wait            # or start the run and return at once
tuner runs get 4821                            # check that run later
```

`sim run --no-wait` prints the run ID and the dashboard link on stdout, so a script can keep the
ID: `RUN_ID=$(tuner sim run --tag smoke --no-wait | head -n 1)`.

## Commands

Run `tuner --help` for the command list. Every command that takes `--output` accepts `text`
(the default) or `json`.

### Global flags

These work before or after the command.

| Flag               | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `--api-key <key>`  | API key; overrides `TUNER_API_KEY` and the stored key   |
| `--base-url <url>` | API base URL; overrides `TUNER_BASE_URL`                |
| `--verbose`        | Print each request with its status and timing to stderr |
| `-V, --version`    | Print the version                                       |
| `-h, --help`       | Print help                                              |

```sh
tuner --base-url https://api.usetuner.ai auth status
tuner --verbose scenarios list
```

`--verbose` prints the method, path, status and time of each request. It never prints the key.

### `tuner sim run`

Start a simulation run and wait for its result.

| Flag                        | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `--tag <tag>`               | Run the agent's scenarios with this exact tag                                |
| `--scenario <id>`           | Run this scenario ID; repeat it or comma-separate for several                |
| `--agent <agent-id>`        | Agent ID or numeric ID; overrides `TUNER_AGENT_ID`                           |
| `--language <language>`     | Caller language: a code (`en-US`) or full name; see `tuner languages list`   |
| `--profile <name>`          | Test profile name; see `tuner profiles list`                                 |
| `--noise <slug>`            | Background noise slug; see `tuner noise list`                                |
| `--noise-intensity <level>` | `low`, `medium` (default) or `high`, or `0.5`, `1.0`, `1.5`; needs `--noise` |
| `--output <format>`         | `text` or `json`                                                             |
| `--no-wait`                 | Print the run ID and exit without waiting                                    |
| `--timeout <duration>`      | Cancel the run after this long, e.g. `90s`, `30m`, `1h` (default `60m`)      |
| `--fail-on-inconclusive`    | Exit 1 on inconclusive, timed-out or canceled runs                           |

Pass exactly one of `--tag` or `--scenario`.

```sh
tuner sim run --tag smoke
tuner sim run --scenario 311 --scenario 312
tuner sim run --scenario 311,312 --agent booking-staging
tuner sim run --tag smoke --language en-GB --profile "Returning customer"
tuner sim run --tag smoke --noise cafe --noise-intensity high
tuner sim run --tag smoke --timeout 30m --fail-on-inconclusive --output json
```

### `tuner runs get <run-id>`

Print a run's status, per-scenario verdicts and result. Flags: `--agent`, `--output`.

```sh
tuner runs get 4821 --agent booking-staging
```

### `tuner runs cancel <run-id>`

Cancel a run. Flags: `--agent`, `--output`.

```sh
tuner runs cancel 4821
```

### `tuner scenarios list`

List the agent's scenarios with their IDs and tags. Flags: `--tag` (exact tag), `--agent`,
`--output`.

```sh
tuner scenarios list --agent booking-staging --tag smoke
```

### `tuner languages list`

List the values `--language` accepts. Flag: `--output`.

```sh
tuner languages list
```

### `tuner noise list`

List the values `--noise` accepts, with the intensities each one supports. Flag: `--output`.

```sh
tuner noise list
```

```text
SLUG    NAME    INTENSITIES
cafe    Café    low 0.5 · medium 1.0 · high 1.5
office  Office  low 0.5 · medium 1.0 · high 1.5
```

`--noise-intensity` takes either the name (`low`, `medium`, `high`) or the number. Without it,
the run uses `medium` (`1.0`).

### `tuner profiles list`

List the agent's test profiles, the values `--profile` accepts. Flags: `--agent`, `--output`.

```sh
tuner profiles list --agent booking-staging
```

### `tuner agents list`

List the workspace's agents with their numeric ID, Agent ID, name and direction. Flag:
`--output`.

```sh
tuner agents list --output json
```

### `tuner auth login`, `logout`, `status`

See [Auth and config](#auth-and-config).

```sh
printf '%s' "$TUNER_API_KEY" | tuner auth login
tuner auth status
tuner auth logout
```

`auth logout` deletes only the stored file. If `TUNER_API_KEY` is still set, it says so.

## How `sim run` behaves

- **Waiting.** By default `sim run` starts the run, then polls it and prints each scenario's
  verdict as it lands. It ends when the run reaches a final state. `--no-wait` returns as soon
  as the run starts.
- **Timeout.** `--timeout` (default `60m`) bounds the wait. When it runs out, the CLI cancels
  the run, waits up to 10 seconds for it to stop, and exits with `reason: timeout`.
- **Ctrl-C and SIGTERM.** The first signal cancels the run once, waits up to 10 seconds, and
  exits 130 (SIGINT) or 143 (SIGTERM). A second signal exits at once; the run may still be
  going, and the CLI prints the `tuner runs get` command to check it.
- **Retries.** Rate limits, 5xx responses and network errors are retried with backoff. While
  waiting on a run, the CLI gives up after 5 minutes of consecutive failures and reports
  `reason: tuner_error`. A Tuner outage is inconclusive, not your agent's failure.
- **The server decides the verdict.** Every scenario `verdict`, the run `result` and the
  `reason` come from the Tuner API. The CLI shows them and maps them to an exit code; it never
  computes its own.
- **`--fail-on-inconclusive`.** By default an inconclusive (`tuner_error`), timed-out or
  canceled run exits 0, so a Tuner problem does not fail your build. With this flag those exit
  1. A Ctrl-C or SIGTERM still exits 130 or 143.

## Exit codes

Exit codes are a contract: changing one is a breaking change.

| Exit | Meaning                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Success. The run passed; or it was inconclusive (`tuner_error`), timed out or canceled without `--fail-on-inconclusive`. Also `--no-wait`, `runs`, the lists and `auth` on success. |
| 1    | The agent failed: at least one scenario's verdict is `failed` (`reason: agent_failed`). With `--fail-on-inconclusive`, also inconclusive, timed-out and canceled runs.              |
| 2    | Nothing ran: a usage or config error, a rejected key, an unknown agent, tag, scenario or name, no credits, a run already in flight, or any other error.                             |
| 130  | Interrupted by SIGINT: Ctrl-C, or a canceled GitHub Actions job (see [CI usage](#ci-usage)). The run was canceled first.                                                            |
| 143  | Stopped by SIGTERM, for example from `kill` or a process manager. The run was canceled first.                                                                                       |

One exception to exit 2: in `sim run`, Tuner being unreachable (after retries) is
`tuner_error` and exits 0, or 1 with `--fail-on-inconclusive`. Other commands exit 2 when Tuner
is unreachable.

## Error codes

When a command stops, it prints `Error: <message>` to stderr. In `sim run --output json`, the
`code` is also in the document's `reason` and `error.code`.

Two exceptions:

- `canceled` prints no `Error:` line, and its JSON document has no `error` object: only
  `reason: "canceled"` and `exit_code` 130 or 143.
- Flag parsing errors (an unknown flag, a bad `--output` value) print a lowercase `error:` line
  and the command's usage, exit 2, and write no JSON document, even with `--output json`.

Codes the CLI raises itself:

| `code`         | Meaning                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `usage_error`  | Bad flags or values: both or neither of `--tag` and `--scenario`, a bad run or scenario ID, a bad `--timeout` or base URL. |
| `config_error` | No API key, no agent, or `TUNER_WORKSPACE_ID` does not match the key's workspace.                                          |
| `tuner_error`  | Tuner was unreachable or failed after retries. In `sim run` this is inconclusive, not exit 2.                              |
| `canceled`     | In `sim run`, a signal arrived before the run started. Exits 130 or 143.                                                   |

Codes from the Tuner API that the CLI explains:

| `code`                      | Meaning                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `invalid_api_key`           | The key is missing, unknown or revoked. The message names where the key came from.          |
| `insufficient_access`       | The key cannot access this workspace or agent.                                              |
| `agent_not_found`           | No agent with this ID in the key's workspace. See `tuner agents list`.                      |
| `scenario_not_found`        | A `--scenario` ID is missing, deleted or another agent's. See `tuner scenarios list`.       |
| `no_scenarios_for_tag`      | No active scenario of this agent has the tag. See `tuner scenarios list`.                   |
| `unresolved_name`           | `--language`, `--profile` or `--noise` matched nothing. The message names the list command. |
| `insufficient_credits`      | The workspace has no credits left, or its plan does not include simulations.                |
| `run_in_flight`             | The agent already has a run in progress. The message gives its run ID and link.             |
| `simulation_not_configured` | The agent is not set up for simulations (for example, no pass/fail eval).                   |

Any other API `code` is passed through with the API's message, for example `run_not_found`,
`run_too_large` (more than 20 scenarios), `workspace_not_found`, `validation_error`,
`rate_limited` and `internal_error`. All of these exit 2, with one exception: in `sim run`, a
`rate_limited` or 5xx error that is still failing after retries becomes `tuner_error` and exits
0, or 1 with `--fail-on-inconclusive`.

Only commands that read data retry `rate_limited`, 5xx and network errors. `runs cancel` and
`auth login` send their request once.

## JSON output

With `--output json`, stdout holds exactly one JSON document and nothing else. Progress,
warnings and verbose logs go to stderr, so `tuner sim run --tag smoke --output json >
result.json` is safe.

Every document has `schema_version: 1`. Version 1 only ever gains fields; a removed or renamed
field means a new version. The `sim run` and `runs` document is described by
[`schema/run-result.v1.json`](schema/run-result.v1.json). An abbreviated example:

```json
{
  "schema_version": 1,
  "run": {
    "id": 4821,
    "status": "partial",
    "result": "failed",
    "dashboard_url": "https://...",
    "...": "..."
  },
  "summary": {
    "total": 13,
    "passed": 12,
    "failed": 1,
    "inconclusive": 0,
    "canceled": 0,
    "pending": 0
  },
  "scenarios": [
    {
      "scenario_id": 311,
      "library_scenario_id": 20,
      "name": "Refund request",
      "verdict": "failed",
      "failure_category": "agent_failed",
      "failed_evals": [{ "name": "Refund policy", "value": "FAIL" }],
      "call_id": 99812
    }
  ],
  "reason": "agent_failed",
  "exit_code": 1
}
```

- `reason` is `null` for a passed run; `agent_failed`, `tuner_error`, `timeout` or `canceled`
  for a run that started; or the error `code` when nothing ran. Then `run` is `null` and an
  `error` object holds `code` and `message`, except for `canceled`, which has no `error`.
- Flag parsing errors write no JSON document; see [Error codes](#error-codes).
- `exit_code` is the process exit code.
- The list commands print `{ "schema_version": 1, "<items>": [...] }`, for example
  `scenarios`, `languages`, `noise_environments`, `profiles` or `agents`.
- Only `sim run` writes a JSON document on failure. Other commands print the error to stderr
  and leave stdout empty.

## CI usage

The package is not on npm yet, so build the CLI from source in the job. While the repo is
private, the checkout needs a token that can read `usetuner/tuner-cli`.

```yaml
name: voice-agent-tests
on: [pull_request]

jobs:
  tuner:
    # Fork PRs get no secrets, so skip them instead of failing with exit 2.
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 70 # keep above --timeout so the CLI can cancel the run
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/checkout@v4
        with:
          repository: usetuner/tuner-cli
          path: tuner-cli
          token: ${{ secrets.TUNER_CLI_READ_TOKEN }}
      - name: Build the Tuner CLI
        working-directory: tuner-cli
        run: npm ci && npm run build && npm link
      - name: Run Tuner simulations
        env:
          TUNER_API_KEY: ${{ secrets.TUNER_API_KEY }}
          TUNER_AGENT_ID: ${{ vars.TUNER_AGENT_ID }}
        # exec replaces the step's shell with the CLI, so a job cancel's SIGINT reaches it.
        run: exec tuner sim run --tag smoke --timeout 60m --output json > tuner-result.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: tuner-result
          path: tuner-result.json
```

- The step fails (exit 1) only when the agent fails. Add `--fail-on-inconclusive` to also fail
  on Tuner errors and timeouts.
- When GitHub cancels the job or it times out, the runner sends SIGINT to the step's shell,
  then SIGTERM 7.5 s later, then kills the process tree. Without `exec` the CLI is a child of
  that shell, gets no signal, and the run is left going. With `exec` the CLI gets the SIGINT,
  cancels the run and exits 130.
- Runners must be Linux or macOS.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, scripts, layering and the checks to run
before a PR. Report security issues as described in [SECURITY.md](SECURITY.md). Changes are
listed in [CHANGELOG.md](CHANGELOG.md).

## License

`UNLICENSED` for now: no license is granted yet. A license will be added before the first
public release.
