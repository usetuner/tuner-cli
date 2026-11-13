# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `tuner sim run`: start a simulation run for an agent, wait for it, and exit with a code that reflects the server's verdict.
- `tuner runs`: inspect and cancel runs.
- `tuner scenarios`, `languages`, `noise`, `profiles` and `agents`: list workspace resources.
- `tuner auth`: log in (validate and store the key), log out, and show which key is in use. The credentials file is `0600`.
- `--output json` with a versioned schema (`schema_version: 1`, `schema/run-result.v1.json`).
- Config from flags, then environment variables, then the stored credentials file.
- HTTP client with request timeouts, retries with backoff for safe requests, and typed error codes.
- SIGINT, SIGTERM and `--timeout` cancel the run once and wait for it before exiting.
- Exit codes: 0 passed or inconclusive, 1 agent failed, 2 input or account error, 130 SIGINT, 143 SIGTERM.
- Types generated from the public OpenAPI schema.
- CI for lint, format, types, tests, build and `npm audit` on Linux and macOS.
- Coverage thresholds, CodeQL, Dependabot, and contributor and security docs.
