# Contributing

Thanks for helping improve the Tuner CLI.

## Setup

- Node 22 or later (`engines` is `>=22`). `.nvmrc` pins the version used for development: run `nvm use`.
- Linux or macOS. Windows is not supported.

```sh
npm ci
npm run build
node dist/cli/main.js --help
```

## Scripts

| Script                            | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run build`                   | Compile to `dist/`                                                     |
| `npm run typecheck`               | Type-check without emitting                                            |
| `npm run lint`                    | ESLint                                                                 |
| `npm run format` / `format:check` | Prettier write / check                                                 |
| `npm test`                        | Vitest                                                                 |
| `npm run test:coverage`           | Vitest with coverage; fails below the thresholds in `vitest.config.ts` |
| `npm run gen:types`               | Regenerate `src/generated/api.ts` from `openapi/openapi.json`          |

Before you open a PR, run:

```sh
npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run build
```

## Generated types

`src/generated/` is generated from the backend's public OpenAPI schema. Never edit it by hand.

1. Update `openapi/openapi.json`. Today `npm run gen:openapi` builds it from a local backend checkout; a step that fetches the public `/public/openapi.json` is coming.
2. Run `npm run gen:types`.
3. Commit both files together.

## Layering

Each layer is a directory under `src/`. The ports (`TunerApi`, `CredentialStore`, `Clock`, `Signals`, `Output`) live in `src/ports.ts`, and their test fakes in `test/fakes/`.

| Layer                  | Holds                                                       | Rule                                                                         |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| CLI wiring (`cli/`)    | commander setup, help text                                  | No logic. Parse argv, call one command.                                      |
| Commands (`commands/`) | one file per command group                                  | Flags to a typed input, call one use case, map typed errors to an exit code. |
| Use cases (`app/`)     | start, wait, cancel, list, auth                             | Business flow only. Talk to ports, never to `fetch`, `process` or `fs`.      |
| Domain (`domain/`)     | exit codes, result classification, durations, output models | Pure functions, tested without mocks.                                        |
| Adapters (`adapters/`) | HTTP client, credential store, renderers, signals           | All I/O lives here.                                                          |

- The runtime (env, stdout, stderr, clock, fetch, signals) is injected. Only the entry point, `src/cli/main.ts`, reads `process.*`.
- stdout is data, stderr is for people. With `--output json`, stdout holds exactly one JSON document.
- The server decides verdicts. The CLI never derives its own.
- The API key never appears in output, logs, errors or test snapshots.
- Exit codes, JSON output (`schema_version: 1`, add fields only) and flags are a public contract. Renaming a flag keeps the old one with a deprecation warning for one minor version.
- Every runtime dependency needs a reason in the PR.

## Pull requests

- One concern per PR, squash-merged after CI passes.
- One concern per commit, with a one-line message of about 70 characters.
- Fill in the PR template: what changed, invariants touched, how tested, evidence, follow-ups.
- Coverage thresholds never go down. Raise them when coverage grows.
- Add an entry under `Unreleased` in `CHANGELOG.md` for user-visible changes.

## Releasing

Publishing to npm is manual. You need to be a member of the `usetuner.ai` npm org.

1. Move the `Unreleased` entries in `CHANGELOG.md` under the new version and merge that to `main`.
2. From an up-to-date `main`, run `npm login`, then `npm run release:patch` (or `release:minor`, `release:major`).
3. Push the version commit and tag: `git push --follow-tags`.

For the first release (0.1.0), run `npm publish` instead: `release:patch` would bump to 0.1.1 first.

`release:*` runs `npm version` and `npm publish`. `prepublishOnly` runs typecheck, lint and tests, and `prepack` builds `dist/`.

## Security

Report vulnerabilities privately, as described in [`SECURITY.md`](SECURITY.md).

## Code of conduct

This project follows the [code of conduct](CODE_OF_CONDUCT.md).
