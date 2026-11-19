# Errors and retries

Every way a `tuner` command can end maps to one exit code and one message:

| Exit | Meaning                                                      |
| ---- | ------------------------------------------------------------ |
| 0    | Every scenario passed, or the command did what you asked.    |
| 1    | At least one scenario failed its evals.                      |
| 2    | A problem you must fix. The message says what to do.         |
| 3    | A problem on Tuner's side. Try again later.                  |
| 130  | Stopped by SIGINT (Ctrl-C). A started run is canceled first. |
| 143  | Stopped by SIGTERM. A started run is canceled first.         |

When several apply, the worst wins: 1, then 2, then 3, then 0.

When a command stops on an error, it prints `Error: <message>` to stderr. In `sim run --output
json`, the `code` below is also in the document's `reason` and `error.code`, and the exit in
`exit_code`. Two exceptions:

- `canceled` prints no `Error:` line, and its JSON document has no `error` object: only
  `reason: "canceled"` and `exit_code` 130 or 143.
- Flag parsing errors print commander's lowercase `error:` line and the command's usage, exit 2,
  and write no JSON document, even with `--output json`.

## Problems you must fix (exit 2)

### Flags and setup

| Trigger                                              | `code`         | Message                                                                                   |
| ---------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Unknown command or flag, bad `--output`, missing arg | none           | `error: unknown option '--bogus'` (commander's text) and the usage                        |
| A command group with no command (`tuner sim`)        | none           | The group's usage on stderr                                                               |
| Both or neither of `--tag` and `--scenario`          | `usage_error`  | `Pass exactly one of --tag or --scenario.`                                                |
| A bad scenario ID                                    | `usage_error`  | `Invalid scenario ID 'x'. Use numeric IDs from` `tuner scenarios list`                    |
| A bad run ID                                         | `usage_error`  | `Invalid run ID 'abc'. Use the numeric run ID.`                                           |
| A bad `--timeout`                                    | `usage_error`  | `Invalid duration '5x'. Use e.g. 90s, 30m, 1h.`                                           |
| `--noise-intensity` without `--noise`                | `usage_error`  | `--noise-intensity needs --noise <slug>.`                                                 |
| A `--meta` pair without `=` or with an empty key     | `usage_error`  | `Invalid --meta 'x'. Use key=value.`                                                      |
| The same `--meta` key twice                          | `usage_error`  | `Duplicate --meta key 'k'. Pass each key once.`                                           |
| A bad `--base-url` or `TUNER_BASE_URL`               | `usage_error`  | `Invalid base URL '…'.` or `Base URL must be http or https, got '…'.`                     |
| `auth login` got an empty key                        | `usage_error`  | `No API key given. Pass --api-key, pipe the key on stdin, or run in a terminal.`          |
| No key in the flag, the env or the stored file       | `config_error` | `No API key. Set TUNER_API_KEY or run` `tuner auth login`                                 |
| The stored credentials file is broken or unreadable  | `config_error` | `Can't read the stored API key at <path> (not valid JSON). Run tuner auth login again, …` |
| `auth login` can't write, `auth logout` can't delete | `config_error` | `Can't save the API key to <path> (EACCES).` or `Can't remove <path> (EACCES).`           |
| No agent for a command that needs one                | `config_error` | `No agent. Pass --agent <agent-remote-id> or set TUNER_AGENT_ID.`                         |
| `TUNER_WORKSPACE_ID` is not the key's workspace      | `config_error` | `TUNER_WORKSPACE_ID is 7 but the API key belongs to workspace 73 (Acme).`                 |

### Codes from the Tuner API

| `code`                      | HTTP    | Message the CLI prints                                                                                | What to do                                          |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `invalid_api_key`           | 401/403 | `API key rejected (Invalid API key); key from TUNER_API_KEY. Set a valid key …`                       | Use a valid, unrevoked key.                         |
| `insufficient_access`       | 403     | `This API key can't access it: <detail>. Use a key from the agent's workspace.`                       | Use a key from the agent's workspace.               |
| `workspace_not_found`       | 404     | `<detail>. Check the key's workspace with` `tuner auth status`                                        | Check the key.                                      |
| `agent_not_found`           | 404     | `Agent 'x' not found in this workspace. Run` `tuner agents list` `to see agent IDs.`                  | Fix `--agent` or `TUNER_AGENT_ID`.                  |
| `scenario_not_found`        | 404     | `Scenario 501 not found for this agent. Run` `tuner scenarios list` `to see scenario IDs.`            | Fix `--scenario`.                                   |
| `run_not_found`             | 404     | `Run 4821 not found for this agent. Check the run ID and --agent.`                                    | Fix the run ID or `--agent`.                        |
| `no_scenarios_for_tag`      | 422     | `No scenarios tagged 'smoke'. Run` `tuner scenarios list` `to see tags.`                              | Fix `--tag`.                                        |
| `run_too_large`             | 422     | `Run has 120 scenarios; the limit is 100. Split it into smaller tags or scenario lists.`              | Run fewer scenarios at once.                        |
| `unresolved_name`           | 422     | `Unknown noise 'cafe2'. Run` `tuner noise list` (or the languages or profiles list)                   | Use a value from the list.                          |
| `insufficient_credits`      | 402     | `Not enough credits to start this run (<detail>). Add credits or check the workspace plan in Tuner.`  | Add credits, or a plan that includes simulations.   |
| `run_in_flight`             | 409     | `Agent 'x' already has a run in progress (4820). Wait for it to finish, then try again.` and its link | Wait, or cancel it with `tuner runs cancel 4820`.   |
| `simulation_not_configured` | 422     | `The agent isn't set up for simulations: <detail>. Fix it in the agent's settings in Tuner.`          | No settings, no pass/fail eval, or SIP unreachable. |
| `validation_error`          | 4xx     | `Tuner rejected the request (422): <detail>.`                                                         | Fix the value it names.                             |
| any other code              | 4xx     | `<detail> (<status> <code>).`                                                                         | Read the detail.                                    |

A `run_in_flight` always means a run that was already going: the start request is retried only
when it never reached Tuner, so a retry can't collide with a run of its own.

## Problems on Tuner's side (exit 3)

| Trigger                                        | `code`                  | Message                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can't connect (DNS, refused, reset, TLS, 30 s) | `tuner_error`           | `Could not reach https://… (ENOTFOUND), and retries ran out. Check your network and --base-url …`                                                                                                                                                                                                                                                                |
| 5xx until retries run out                      | `tuner_error`           | `Tuner kept failing (502 internal_error), and retries ran out. Try again later.`                                                                                                                                                                                                                                                                                 |
| 429 until retries run out                      | `tuner_error`           | `Tuner kept rate limiting requests (429 rate_limited), and retries ran out. …`                                                                                                                                                                                                                                                                                   |
| `run_start_failed` (503) at start              | `run_start_failed`      | `Tuner couldn't start the run: <detail>.` then `Tuner couldn't finish this run (run_start_failed).`                                                                                                                                                                                                                                                              |
| `internal_error` (500) at start                | `internal_error`        | `Tuner had an internal error (500): <detail>.`                                                                                                                                                                                                                                                                                                                   |
| Any other 5xx code                             | that code               | `<detail> (<status> <code>).`                                                                                                                                                                                                                                                                                                                                    |
| Start sent, then timed out or reset            | `start_outcome_unknown` | `The connection to Tuner was lost after the start request was sent (…), so a run may have started.` then the agent's run in progress, if any: `Run 4830 is in progress for this agent and may be the one this command started. Check it with tuner runs get 4830, or cancel it with tuner runs cancel 4830.` The CLI never retries, watches or cancels that run. |
| A 2xx that is empty or not JSON                | `unexpected_response`   | `Tuner sent a response this CLI can't read (200, not JSON) from GET …. Check --base-url …`                                                                                                                                                                                                                                                                       |
| A crash in the CLI                             | `tuner_error`           | `Unexpected error: <message>. Re-run with --verbose and report it.`                                                                                                                                                                                                                                                                                              |

Unknown codes fall back by HTTP status: 4xx exits 2 and 5xx exits 3, so a newer API never crashes
an older CLI. An error page from a proxy is named by its status (`502 Bad Gateway from https://…`),
never printed.

## How a run ends

A run that started ends with the server's `result` and `reason`. `sim run` prints the line below
after the summary:

| `result`       | `reason`       | Exit | Line                                                                                                                             |
| -------------- | -------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `passed`       | `null`         | 0    | none                                                                                                                             |
| `failed`       | `agent_failed` | 1    | `Result: failed (agent_failed)`                                                                                                  |
| `inconclusive` | `tuner_error`  | 3    | `Tuner couldn't finish this run (tuner_error).` A call never connected, a platform error, a call unreported, or analysis failed. |
| `canceled`     | `canceled`     | 3    | `Run 4821 was canceled outside this command (the dashboard or tuner runs cancel).`                                               |
| anything else  | anything else  | 3    | `Tuner returned a result this CLI doesn't know (result: …, reason: …). Upgrade tuner-cli.`                                       |

The CLI's own stops:

| Trigger                                   | `reason`       | Exit       | Message                                                                                                      |
| ----------------------------------------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `--timeout` reached                       | `timeout`      | 3          | `Timed out after 1h (--timeout 60m). Canceling run 4821...` then `Tuner couldn't finish this run (timeout).` |
| `--timeout` reached, server said `failed` | `agent_failed` | 1          | as above, then the failed scenarios                                                                          |
| Polling failed for 5 minutes              | `tuner_error`  | 3          | `Tuner unreachable for 5 minutes (…). Run 4821 may still be going; check it with tuner runs get 4821.`       |
| Polling got a 4xx (key revoked, run gone) | that code      | 2          | `Could not read run 4821: <message> Run 4821 may still be going; …`                                          |
| First SIGINT or SIGTERM                   | `canceled`     | 130 or 143 | `Canceling run 4821...` The run is canceled once; the CLI waits up to 10 seconds.                            |
| Second signal                             | `canceled`     | 130 or 143 | `Stopped. Run 4821 may still be going; check it with tuner runs get 4821.`                                   |
| A signal during any other command         | none           | 130 or 143 | none: nothing is running, so the command stops at once.                                                      |
| `--no-wait`                               | `null`         | 0          | The run ID and link on stdout.                                                                               |

`runs get` and `runs cancel` exit 0 whatever the run's result: they report it, they don't judge
it. The list and `auth` commands exit 0 on success.

### Known gaps

Tuner labels these runs `tuner_error` (exit 3) today, though they are yours to fix (exit 2):
your voice provider out of credits or quota, and an agent that never answered the call. A crash
of Tuner's own caller in the middle of a call can show as `agent_failed` (exit 1). Check the
scenario's message and the dashboard before acting on the exit code alone.

## Retries

The CLI retries 429, 5xx and network errors with backoff (3, 6, 12, 24 s, then 30 s), honoring
`Retry-After`:

- `sim run`: the key and agent lookup and the polling, for up to 5 minutes of consecutive
  failures each, and the cancel it sends on a timeout or signal, for up to 10 seconds.
- `sim run` start request: only when no connection was made (DNS failure, connection refused,
  connect timeout) or Tuner answered 429, since then no run can exist. A 5xx may have created a
  run, so `run_start_failed` exits 3 at once. A timeout or reset after the request was sent leaves
  the outcome unknown: the CLI doesn't retry, looks up the agent's run in progress (the API
  doesn't say who started a run, so the CLI can't claim it), names it and exits 3.
- `runs get`, `runs cancel`, the list commands, `auth login` and `auth status`: every request,
  for up to 30 seconds. Cancel is safe to repeat: a finished run comes back unchanged.

If Tuner is still failing when the retries run out, the error becomes `tuner_error` and the
command exits 3. A Tuner outage is never exit 1.
