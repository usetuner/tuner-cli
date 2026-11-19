# Errors and retries

When a command stops, it prints `Error: <message>` to stderr and exits with the code's exit
below: 2 for a problem you must fix, 3 when Tuner couldn't finish. In `sim run --output json`,
the error `code` is also in the document's `reason` and `error.code`, and the exit in
`exit_code`.

Two exceptions:

- `canceled` prints no `Error:` line, and its JSON document has no `error` object: only
  `reason: "canceled"` and `exit_code` 130 or 143.
- Flag parsing errors (an unknown flag, a bad `--output` value) print a lowercase `error:` line
  and the command's usage, exit 2, and write no JSON document, even with `--output json`.

## Codes the CLI raises

| `code`         | Exit       | Meaning                                                                                                                    |
| -------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `usage_error`  | 2          | Bad flags or values: both or neither of `--tag` and `--scenario`, a bad run or scenario ID, a bad `--timeout` or base URL. |
| `config_error` | 2          | No API key, no agent, or `TUNER_WORKSPACE_ID` does not match the key's workspace.                                          |
| `tuner_error`  | 3          | Tuner was unreachable or failed after retries. See [Retries](#retries).                                                    |
| `canceled`     | 130 or 143 | In `sim run`, a signal arrived before the run started.                                                                     |

## Run reasons

A run that started ends with one of these `reason` values:

| `reason`       | Exit | Meaning                                                                                                 |
| -------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `null`         | 0    | Every scenario passed.                                                                                  |
| `agent_failed` | 1    | At least one scenario failed its evals.                                                                 |
| `tuner_error`  | 3    | Tuner couldn't finish the run (a call never connected, a platform error, or polling gave up).           |
| `canceled`     | 3    | The run was canceled from elsewhere. Our own Ctrl-C or SIGTERM exits 130 or 143 instead.                |
| `timeout`      | 3    | `--timeout` was reached. The CLI canceled the run and names the elapsed time and the `--timeout` value. |

When several apply, the worst wins: 1, then 2, then 3. For example, a timed-out run the server
already marked `failed` exits 1.

## Codes from the Tuner API

The CLI adds a hint to these:

| `code`                      | Exit | Meaning                                                                                     |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `invalid_api_key`           | 2    | The key is missing, unknown or revoked. The message names where the key came from.          |
| `insufficient_access`       | 2    | The key cannot access this workspace or agent.                                              |
| `agent_not_found`           | 2    | No agent with this ID in the key's workspace. See `tuner agents list`.                      |
| `scenario_not_found`        | 2    | A `--scenario` ID is missing, deleted or another agent's. See `tuner scenarios list`.       |
| `no_scenarios_for_tag`      | 2    | No active scenario of this agent has the tag. See `tuner scenarios list`.                   |
| `unresolved_name`           | 2    | `--language`, `--profile` or `--noise` matched nothing. The message names the list command. |
| `insufficient_credits`      | 2    | The workspace has no credits left, or its plan does not include simulations.                |
| `run_in_flight`             | 2    | The agent already has a run in progress. The message gives its run ID and link.             |
| `simulation_not_configured` | 2    | The agent is not set up for simulations (for example, no pass/fail eval).                   |

Any other API `code` is passed through with the API's message. `run_not_found`, `run_too_large`
(more than 20 scenarios), `workspace_not_found`, `validation_error`, `rate_limited` and any other
4xx exit 2. `internal_error`, `run_start_failed` and any other 5xx exit 3. A 401 or 403 always
exits 2.

## Retries

The CLI retries `rate_limited`, 5xx and network errors with backoff, in these places:

- `sim run`: the key and agent lookup, the start request and the polling, for up to 5 minutes of
  consecutive failures each, and the cancel it sends on a timeout or signal, for up to 10 seconds.
- `runs get`, `runs cancel`, `auth status` and the list commands: the key and agent lookup and
  their reads, for up to 30 seconds.

`runs cancel` sends its cancel request once, and `auth login` sends its key check once.

If Tuner is still failing when the retries run out, the error becomes `tuner_error` and the
command exits 3. A Tuner outage is not your agent's failure, so it is never exit 1.
