# JSON output

With `--output json`, stdout holds exactly one JSON document and nothing else. Progress, warnings
and verbose logs go to stderr, so you can redirect stdout to a file:

```bash
tuner sim run --tag smoke --output json > result.json
```

## Versioning

Every document has `schema_version: 1`. Version 1 only gains fields. A removed or renamed field
means a new version.

## Run document

`sim run`, `runs get` and `runs cancel` print the run document described by
[`schema/run-result.v1.json`](../schema/run-result.v1.json). An abbreviated example:

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

| Field       | Meaning                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `reason`    | `null` for a passed run; `agent_failed`, `tuner_error`, `timeout` or `canceled` for a run that started; or the error `code` when nothing ran. |
| `run`       | `null` when nothing ran.                                                                                                                      |
| `error`     | Present when nothing ran, with `code` and `message`. A `canceled` document has no `error`.                                                    |
| `exit_code` | The process exit code.                                                                                                                        |

`run.metadata` holds the run's `--meta` pairs as Tuner returns them, or `null` when the run has
none; older runs may hold non-string values. `run.tag` is the tag the run was started with, or
`null` when it was started by scenario IDs; it is absent when Tuner doesn't return it.

## List documents

The list commands print `{ "schema_version": 1, "<items>": [...] }`, where `<items>` is
`scenarios`, `languages`, `noise_environments`, `profiles` or `agents`.

## On failure

Only `sim run` writes a JSON document when it fails. Other commands print the error to stderr and
leave stdout empty. Flag parsing errors write no document in any command; see
[Errors](errors.md).
