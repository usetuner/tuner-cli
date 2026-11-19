# Errors and retries

When a command stops, it prints `Error: <message>` to stderr and exits 2, except as noted under
[Retries](#retries). In `sim run --output json`, the error `code` is also in the document's
`reason` and `error.code`.

Two exceptions:

- `canceled` prints no `Error:` line, and its JSON document has no `error` object: only
  `reason: "canceled"` and `exit_code` 130 or 143.
- Flag parsing errors (an unknown flag, a bad `--output` value) print a lowercase `error:` line
  and the command's usage, exit 2, and write no JSON document, even with `--output json`.

## Codes the CLI raises

| `code`         | Meaning                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `usage_error`  | Bad flags or values: both or neither of `--tag` and `--scenario`, a bad run or scenario ID, a bad `--timeout` or base URL. |
| `config_error` | No API key, no agent, or `TUNER_WORKSPACE_ID` does not match the key's workspace.                                          |
| `tuner_error`  | Tuner was unreachable or failed after retries. See [Retries](#retries).                                                    |
| `canceled`     | In `sim run`, a signal arrived before the run started. Exits 130 or 143.                                                   |

## Codes from the Tuner API

The CLI adds a hint to these:

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
`rate_limited` and `internal_error`.

## Retries

The CLI retries `rate_limited`, 5xx and network errors with backoff, in these places:

- `sim run`: the key and agent lookup, the start request and the polling, for up to 5 minutes of
  consecutive failures each, and the cancel it sends on a timeout or signal, for up to 10 seconds.
- `runs get`, `runs cancel`, `auth status` and the list commands: the key and agent lookup and
  their reads, for up to 30 seconds.

`runs cancel` sends its cancel request once, and `auth login` sends its key check once.

In `sim run`, if Tuner is still failing when the retries run out, the error becomes `tuner_error`
and the command exits 0, or 1 with `--fail-on-inconclusive`. A Tuner outage is inconclusive, not
your agent's failure. Every other command exits 2 when Tuner stays unreachable.
