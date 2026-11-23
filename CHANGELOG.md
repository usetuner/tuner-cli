# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- `tuner sim run --meta key=value`, repeatable: send metadata with the run. `sim run` and `runs get` show it as a `Metadata:` line, and JSON output adds `run.metadata`, plus `run.tag` when Tuner returns it.

## [0.1.0]

First release, published to npm as `@usetuner.ai/cli`. Installs the `tuner` command.

### Added

- `tuner sim run`: start a simulation run for an agent, wait for it, and exit with the server's verdict. Supports tags, scenarios, background noise and intensity, `--no-wait` and `--timeout`.
- `tuner runs`: get and cancel runs.
- `tuner scenarios`, `languages`, `noise`, `profiles` and `agents`: list workspace resources.
- `tuner auth`: log in, log out, and show which API key is in use.
- `--output json` with a versioned schema (`schema_version: 1`, `schema/run-result.v1.json`).
- Exit codes: 0 every scenario passed, 1 a scenario failed its evals, 2 a problem you must fix, 3 Tuner couldn't finish the run; 130 on SIGINT and 143 on SIGTERM, after canceling the run.
