# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- Exit codes follow the CI/CD spec: 0 every scenario passed, 1 a scenario failed its evals, 2 a problem you must fix, 3 Tuner couldn't finish the run. Runs that end `tuner_error`, are canceled elsewhere, or reach `--timeout` now exit 3 (were 0). When several apply, the worst wins: 1, then 2, then 3. `schema/run-result.v1.json` allows `exit_code` 3; `schema_version` stays 1.
- `rate_limited` exits 3 everywhere, like any failure that outlasts the retries (was 2 in `auth login`).
- `tuner sim`, `tuner runs` and the other groups run without a subcommand exit 2 (were 0), so a typo in CI can't pass.
- A CLI crash exits 3 (was 2).

### Deprecated

- `tuner sim run --fail-on-inconclusive` has no effect and prints a warning to stderr; it will be removed in a later minor version.

### Changed

- `sim run` no longer retries its start request on a 5xx: a `run_start_failed` exits 3 at once instead of creating more failed runs. It retries only a request that never reached Tuner (DNS, refused) or a 429. A start that timed out or was reset after it was sent is not retried: it exits 3 with `start_outcome_unknown` and names the agent's run in progress, if any.
- `runs cancel`, the list reads and `auth login` retry 429, 5xx and network errors for up to 30 seconds, like `runs get`.
- Every failure has its own message that says what to do: `run_in_flight` names the agent and the run, `insufficient_credits` says the run can't start, a run canceled elsewhere says so, a broken credentials file is named instead of reported as no key, and a proxy's HTML error page is named by its status instead of printed.
- A 2xx response that is empty or not JSON exits 3 with `unexpected_response`, and an unknown `result` or `reason` asks you to upgrade.

- On `--timeout`, `sim run` prints the elapsed time and the `--timeout` value.
- `tuner sim run` names the agent and its numeric ID in the start banner, e.g. `Agent: booking-staging (616)`.

### Added

- `README.md` (install, quick start, common tasks, config, exit codes) and `docs/` (commands, errors, JSON output, CI and signals).
- `sim run` and `runs get` print the run's noise and intensity; `--output json` adds `run.config.noise_intensity` (additive, `schema_version` stays 1).
- `tuner sim run --noise-intensity <level>`: a name (`low`, `medium`, `high`) or a gain (`0.5`, `1.0`, `1.5`), passed to the API as-is. Needs `--noise`.
- `tuner noise list` shows each environment's intensities from the API (`-` when the API sends none).
- `tuner sim run`: start a simulation run for an agent, wait for it, and exit with a code that reflects the server's verdict.
- `tuner runs`: inspect and cancel runs.
- `tuner scenarios`, `languages`, `noise`, `profiles` and `agents`: list workspace resources.
- `tuner auth`: log in (validate and store the key), log out, and show which key is in use. The credentials file is `0600`.
- `--output json` with a versioned schema (`schema_version: 1`, `schema/run-result.v1.json`).
- Config from flags, then environment variables, then the stored credentials file.
- HTTP client with request timeouts, retries with backoff for safe requests, and typed error codes.
- SIGINT, SIGTERM and `--timeout` cancel the run once and wait for it before exiting.
- Exit codes: 0 passed, 1 agent failed, 2 a problem you must fix, 3 Tuner couldn't finish the run, 130 SIGINT, 143 SIGTERM.
