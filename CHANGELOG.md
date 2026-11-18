# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- New exit codes. 3: the run did not test your agent (Tuner unreachable after retries, 5xx, `run_start_failed`, `reason: tuner_error`, or a run canceled elsewhere); these used to exit 0. 4: the API key was rejected (401/403), on every command; was 2. 5: nothing to run (tag matches no scenario, unknown workspace, agent or scenario ID); was 2. 124: `--timeout` reached; was 0. When several apply, the worst wins: 1, then 3, then 124. `schema/run-result.v1.json` allows the new `exit_code` values; `schema_version` stays 1.

### Deprecated

- `tuner sim run --fail-on-inconclusive` has no effect and prints a warning to stderr; it will be removed in a later minor version.

### Changed

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
- Exit codes: 0 passed, 1 agent failed, 2 usage or config error, 3 run did not test the agent, 4 auth error, 5 nothing to run, 124 timeout, 130 SIGINT, 143 SIGTERM.
