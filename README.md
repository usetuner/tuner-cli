# Tuner CLI

Run Tuner voice-agent simulations from your terminal and your CI.

[![ci](https://github.com/usetuner/tuner-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/usetuner/tuner-cli/actions/workflows/ci.yml)

> [!NOTE]
> Pre-release: the CLI is not on npm yet, so you install it from source.
> It supports Linux and macOS. Windows is not supported yet.

## Install

You need Node 22 or later.

```bash
git clone https://github.com/usetuner/tuner-cli.git && cd tuner-cli
npm ci
npm run build
npm link
```

`npm link` puts `tuner` on your PATH. Without it, run `node dist/cli/main.js` instead.

## Quick start

1. Store your API key. The command prompts for it without echoing and checks it before saving.

   ```bash
   tuner auth login
   ```

2. Pick the agent to test. Use its Agent ID or numeric ID from `tuner agents list`.

   ```bash
   export TUNER_AGENT_ID=booking-staging
   ```

3. See which scenarios a tag selects.

   ```bash
   tuner scenarios list --tag smoke
   ```

4. Run them and wait for the result.

   ```bash
   tuner sim run --tag smoke
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

5. Read the exit code: `0` passed, `1` the agent failed, `2` a problem to fix, `3` Tuner
   couldn't finish the run. See [Exit codes](#exit-codes).

## Common tasks

### Run one scenario

```bash
tuner sim run --scenario 311
```

Repeat `--scenario` or comma-separate IDs to run several.

### Start without waiting and check later

```bash
RUN_ID=$(tuner sim run --tag smoke --no-wait | head -n 1)
tuner runs get "$RUN_ID"
```

`--no-wait` prints the run ID and the dashboard link, then exits.

### Add background noise

```bash
tuner noise list
tuner sim run --tag smoke --noise cafe --noise-intensity high
```

### Cancel a run

```bash
tuner runs cancel 4821
```

### Get JSON output

```bash
tuner sim run --tag smoke --output json > result.json
```

stdout holds one JSON document and stderr carries progress. See [JSON output](docs/json-output.md).

### Use in CI (GitHub Actions)

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
          token: ${{ secrets.TUNER_CLI_READ_TOKEN }} # needed while the repo is private
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

See [CI and signals](docs/ci.md) for why `exec` matters and how cancel works.

## Configuration

Each setting comes from the flag first, then the environment variable, then the stored file or
the default. Nothing else is read.

| Setting   | Flag         | Environment variable | Stored file or default                     |
| --------- | ------------ | -------------------- | ------------------------------------------ |
| API key   | `--api-key`  | `TUNER_API_KEY`      | `credentials.json` from `tuner auth login` |
| Base URL  | `--base-url` | `TUNER_BASE_URL`     | `https://api.usetuner.ai`                  |
| Agent     | `--agent`    | `TUNER_AGENT_ID`     | none                                       |
| Workspace | none         | `TUNER_WORKSPACE_ID` | none                                       |

The workspace always comes from the API key. If you set `TUNER_WORKSPACE_ID` and the key belongs
to another workspace, the command stops with `config_error`. For where the key file lives, see
[`tuner auth login`](docs/commands.md#tuner-auth-login).

## Exit codes

Exit codes are a contract: changing one is a breaking change.

| Exit | Meaning                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Every scenario passed. Also `--no-wait`, `runs`, the lists and `auth` on success.                                                                                             |
| 1    | At least one scenario failed its evals (`result: failed`, `reason: agent_failed`).                                                                                            |
| 2    | A problem you must fix: a bad flag, a rejected key, an unknown agent, tag, scenario or workspace, no credits, the agent busy, `run_not_found` or any other 4xx but 429.       |
| 3    | Tuner couldn't finish the run: unreachable or rate limited after retries, a 5xx, `run_start_failed`, `reason: tuner_error`, a run canceled elsewhere, or `--timeout` reached. |
| 130  | Interrupted by SIGINT: Ctrl-C, or a canceled GitHub Actions job. The run was canceled first.                                                                                  |
| 143  | Stopped by SIGTERM, for example from `kill` or a process manager. The run was canceled first.                                                                                 |

When several apply, the worst wins: 1, then 2, then 3. The JSON `reason` and `error.code`
keep the detail. Per-code exits are in [Errors and retries](docs/errors.md).

## Documentation

- [Command reference](docs/commands.md): every command and flag
- [Errors and retries](docs/errors.md): error codes and what they mean
- [JSON output](docs/json-output.md): `schema_version: 1` and the fields
- [CI and signals](docs/ci.md): timeout, cancel and signal handling

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, scripts and the checks to run before a PR.
Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Security

Report security issues as described in [SECURITY.md](SECURITY.md).

## License

`UNLICENSED` for now: no license is granted yet. A license will be added before the first public
release.
