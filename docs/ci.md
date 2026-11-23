# CI and signals

## GitHub Actions

Install the published package with `npm install -g @usetuner.ai/cli`, then run `tuner`. The full workflow is in the [README](../README.md#use-in-ci-github-actions).

Points to keep:

- Run the CLI with `exec`. See [Why `exec` matters](#why-exec-matters).
- The step fails on any non-zero exit: 1 the agent failed, 2 a problem in your setup, 3 Tuner
  couldn't finish the run (timeouts included).
- Runners must be Linux or macOS.

## Timeout

`--timeout` (default `60m`) bounds the wait. When it runs out, the CLI cancels the run, waits up
to 10 seconds for it to stop, and exits 3 with `reason: timeout`. The warning names the elapsed
time and the `--timeout` value, so a timeout set too short is easy to spot.

## Signals

The first SIGINT (Ctrl-C) or SIGTERM cancels the run once, waits up to 10 seconds, and exits 130
(SIGINT) or 143 (SIGTERM). A second signal exits at once. The run may still be going, and the CLI
prints the `tuner runs get` command to check it.

## Why `exec` matters

When GitHub cancels a job or the job times out, the runner sends SIGINT to the step's shell, then
SIGTERM 7.5 seconds later, then kills the process tree. Without `exec`, the CLI is a child of
that shell and gets no signal, so the run is left going. With `exec`, the shell is replaced by the
CLI, which gets the SIGINT, cancels the run and exits 130.
