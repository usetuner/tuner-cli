# Command reference

Run `tuner --help` for the command list. Every command that takes `--output` accepts `text` (the
default) or `json`; see [JSON output](json-output.md).

`--agent` and `TUNER_AGENT_ID` take the agent's Agent ID (remote identifier) or its numeric ID. A
value of digits only is read as the numeric ID. `tuner agents list` shows both.

## Global flags

These work before or after the command.

| Flag               | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `--api-key <key>`  | API key; overrides `TUNER_API_KEY` and the stored key             |
| `--base-url <url>` | API base URL; overrides `TUNER_BASE_URL`                          |
| `--verbose`        | Print the method, path, status and time of each request to stderr |
| `-V, --version`    | Print the version                                                 |
| `-h, --help`       | Print help                                                        |

`--verbose` never prints the key.

```bash
tuner --base-url https://api.usetuner.ai auth status
tuner --verbose scenarios list
```

## `tuner sim run`

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

```bash
tuner sim run --tag smoke
tuner sim run --scenario 311 --scenario 312
tuner sim run --scenario 311,312 --agent booking-staging
tuner sim run --tag smoke --language en-GB --profile "Returning customer"
tuner sim run --tag smoke --noise cafe --noise-intensity high
tuner sim run --tag smoke --timeout 30m --fail-on-inconclusive --output json
```

How it behaves:

- By default the CLI starts the run, polls it, and prints each scenario's verdict as it lands. It
  ends when the run reaches a final state.
- With `--no-wait`, it prints the run ID and the dashboard link on stdout and exits.
- The Tuner API decides every scenario `verdict`, the run `result` and the `reason`. The CLI shows
  them and maps them to an exit code. It never computes its own.
- An inconclusive (`tuner_error`), timed-out or canceled run exits 0 by default, so a Tuner
  problem does not fail your build. `--fail-on-inconclusive` makes those exit 1. A signal still
  exits 130 or 143.
- For `--timeout`, Ctrl-C and SIGTERM, see [CI and signals](ci.md).

## `tuner runs get <run-id>`

Print a run's status, per-scenario verdicts and result.

| Flag                 | What it does                      |
| -------------------- | --------------------------------- |
| `--agent <agent-id>` | Agent ID or numeric ID of the run |
| `--output <format>`  | `text` or `json`                  |

```bash
tuner runs get 4821 --agent booking-staging
```

## `tuner runs cancel <run-id>`

Cancel a run.

| Flag                 | What it does                      |
| -------------------- | --------------------------------- |
| `--agent <agent-id>` | Agent ID or numeric ID of the run |
| `--output <format>`  | `text` or `json`                  |

```bash
tuner runs cancel 4821
```

## `tuner scenarios list`

List the agent's scenarios with their IDs and tags.

| Flag                 | What it does                       |
| -------------------- | ---------------------------------- |
| `--tag <tag>`        | Only scenarios with this exact tag |
| `--agent <agent-id>` | Agent ID or numeric ID             |
| `--output <format>`  | `text` or `json`                   |

```bash
tuner scenarios list --agent booking-staging --tag smoke
```

## `tuner languages list`

List the values `--language` accepts. Flag: `--output`.

```bash
tuner languages list
```

## `tuner noise list`

List the values `--noise` accepts, with the intensities each one supports. Flag: `--output`.

```bash
tuner noise list
```

```text
SLUG    NAME    INTENSITIES
cafe    Café    low 0.5 · medium 1.0 · high 1.5
office  Office  low 0.5 · medium 1.0 · high 1.5
```

`--noise-intensity` takes the name (`low`, `medium`, `high`) or the number. Without it, the run
uses `medium` (`1.0`).

## `tuner profiles list`

List the agent's test profiles, the values `--profile` accepts.

| Flag                 | What it does           |
| -------------------- | ---------------------- |
| `--agent <agent-id>` | Agent ID or numeric ID |
| `--output <format>`  | `text` or `json`       |

```bash
tuner profiles list --agent booking-staging
```

## `tuner agents list`

List the workspace's agents with their numeric ID, Agent ID, name and direction. Flag:
`--output`.

```bash
tuner agents list --output json
```

## `tuner auth login`

Check an API key against the API, then store it. The command reads the key from `--api-key`, from
stdin when stdin is not a terminal, or from a hidden prompt. Prefer stdin or the prompt: a key
passed with `--api-key` ends up in your shell history.

```bash
printf '%s' "$TUNER_API_KEY" | tuner auth login
```

The key is stored in `credentials.json` with mode `0600`, in a directory with mode `0700`:

| OS    | Path                                                                                      |
| ----- | ----------------------------------------------------------------------------------------- |
| macOS | `~/Library/Application Support/tuner/credentials.json`                                    |
| Linux | `$XDG_CONFIG_HOME/tuner/credentials.json`, or `~/.config/tuner/credentials.json` if unset |

## `tuner auth status`

Show which key is in use, where it came from, its workspace and the base URL.

```bash
tuner auth status
```

## `tuner auth logout`

Delete the stored key file. If `TUNER_API_KEY` is still set, the command says so.

```bash
tuner auth logout
```
