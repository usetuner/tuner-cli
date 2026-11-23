import { type GlobalFlags, resolveAgentRef } from "../domain/config.js";
import { formatDuration } from "../domain/duration.js";
import { startOutcomeUnknown, toCliError } from "../domain/error-message.js";
import { NetworkError } from "../domain/errors.js";
import { EXIT, type RunReason, exitForRun, exitForSignal, exitForTimeout } from "../domain/exit.js";
import {
  DEFAULT_TIMEOUT,
  type StartOptions,
  buildStartBody,
  parseTimeout,
} from "../domain/inputs.js";
import type { Run, StartRunRequest } from "../domain/types.js";
import type { AppDeps, Output, Signals, TunerApi } from "../ports.js";
import { type PollOutcome, StopController, cancelAndWait, pollRun } from "./poll.js";
import { POLL_GIVE_UP_MS, notSent, withRetry } from "./retry.js";
import { type Target, resolveTarget } from "./target.js";

export interface SimRunInput {
  flags: GlobalFlags;
  agent?: string;
  start: StartOptions;
  wait: boolean;
  timeout?: string;
}

export interface SimRunDeps extends AppDeps {
  signals: Signals;
  output: Output;
}

/**
 * `error`: nothing ran (or Tuner failed before the start). `canceled`: a signal came first.
 * `started`: `--no-wait`. `finished`: the run ended, was stopped, or polling gave up.
 */
export interface SimRunResult {
  kind: "error" | "canceled" | "started" | "finished";
  run?: Run;
  runId?: number;
  target?: Target;
  reason: string | null;
  exitCode: number;
  /** The run reached a final state on its own (not stopped, not given up on). */
  terminal?: boolean;
  error?: { code: string; message: string; [key: string]: unknown };
}

/** Starts a run, waits for its result, and cancels it on a signal or the timeout. */
export async function runSimulation(deps: SimRunDeps, input: SimRunInput): Promise<SimRunResult> {
  const { output, signals } = deps;
  const timeout = input.timeout ?? DEFAULT_TIMEOUT;
  const stop = new StopController();
  let runId: number | undefined;
  let target: Target | undefined;
  const unsubscribe = signals.onSignal((signal) => {
    if (stop.stopped) {
      output.progress(
        runId !== undefined
          ? `Stopped. Run ${runId} may still be going; check it with \`tuner runs get ${runId}\`.`
          : "Stopped.",
      );
      signals.exit(exitForSignal(signal));
    }
    stop.stopBySignal(signal);
  });
  const result = (r: Omit<SimRunResult, "runId" | "target">): SimRunResult => ({
    ...r,
    runId,
    target,
  });
  const fail = (err: unknown, tag?: string, agentName?: string): SimRunResult => {
    if (stop.signal) {
      return result({ kind: "canceled", reason: "canceled", exitCode: exitForSignal(stop.signal) });
    }
    const agentRef = resolveAgentRef(input.agent, deps);
    const cli = toCliError(err, { tag, agentRef, agentName });
    if (cli.reason === "tuner_error") {
      return result({
        kind: "error",
        reason: "tuner_error",
        exitCode: exitForRun(null, "tuner_error"),
        error: { code: "tuner_error", message: cli.message },
      });
    }
    return result({
      kind: "error",
      reason: cli.reason,
      exitCode: cli.exitCode,
      error: { code: cli.reason, message: cli.message, ...cli.extra },
    });
  };
  const retrying = (err: Error, delay: number) =>
    output.progress(
      `Tuner unavailable (${err.message}); retrying in ${Math.round(delay / 1000)}s...`,
    );

  try {
    let body: StartRunRequest;
    let timeoutMs: number;
    try {
      body = buildStartBody(input.start);
      timeoutMs = parseTimeout(timeout);
      target = await resolveTarget(deps, {
        flags: input.flags,
        agent: input.agent,
        needAgent: true,
        giveUpMs: POLL_GIVE_UP_MS,
        signal: stop.abortSignal,
      });
    } catch (err) {
      return fail(err);
    }
    const { api, workspace } = target;
    const agent = target.agent!;
    output.progress(`Workspace: ${workspace.name} · Agent: ${agent.name} (${agent.id})`);

    let started;
    try {
      // The POST itself is not aborted by a signal, so a run it creates can still be canceled.
      // Not idempotent: retry only a request that never reached Tuner, or a 429.
      started = await withRetry(() => api.startRun(workspace.id, agent.id, body), {
        clock: deps.clock,
        giveUpMs: POLL_GIVE_UP_MS,
        signal: stop.abortSignal,
        onRetry: retrying,
        retryOn: notSent,
      });
    } catch (err) {
      if (err instanceof NetworkError && err.sent && !stop.signal) {
        const inFlight = await findInFlightRun(api, workspace.id, agent.id);
        return fail(startOutcomeUnknown(err.message, inFlight));
      }
      return fail(err, input.start.tag, agent.name);
    }
    if (!started) {
      return result({
        kind: "canceled",
        reason: "canceled",
        exitCode: exitForSignal(stop.signal ?? "SIGINT"),
      });
    }
    runId = started.simulation_run_id;
    output.progress(`Running ${started.generated_count} scenarios (run ${runId})...`);

    const ref = { api, workspaceId: workspace.id, agentId: agent.id, runId, clock: deps.clock };

    if (!input.wait) {
      let run: Run | undefined;
      try {
        run = await api.getRun(workspace.id, agent.id, runId);
      } catch {
        // the run started; the URL is a convenience
      }
      return result({ kind: "started", run, reason: null, exitCode: EXIT.OK });
    }

    let outcome: PollOutcome;
    let waitStart = deps.clock.now();
    if (stop.stopped) {
      outcome = { kind: "stopped", run: undefined };
    } else {
      waitStart = deps.clock.now();
      const timer = setTimeout(() => stop.stopByTimeout(), timeoutMs);
      try {
        outcome = await pollRun({
          ...ref,
          stop,
          onUpdate: (run) => output.run(run),
          onRetry: retrying,
        });
      } finally {
        clearTimeout(timer);
      }
    }

    let run = outcome.run;
    let reason: string | null;
    let exitCode: number;
    if (outcome.kind === "terminal") {
      run = outcome.run;
      const runReason = (run.reason as RunReason | null) ?? null;
      reason = runReason;
      exitCode = exitForRun(run.result, runReason);
    } else if (outcome.kind === "stopped") {
      const bySignal = stop.signal;
      output.progress(
        bySignal
          ? `Canceling run ${runId}...`
          : `Timed out after ${formatDuration(deps.clock.now() - waitStart)} (--timeout ${timeout}). Canceling run ${runId}...`,
      );
      const canceled = await cancelAndWait(ref);
      run = canceled.run ?? run;
      if (canceled.error) {
        output.progress(
          `Could not cancel run ${runId}: ${canceled.error instanceof Error ? canceled.error.message : String(canceled.error)}. It may still be running.`,
        );
      } else if (run?.status === "analyzing") {
        output.progress(`Run ${runId} is analyzing: its calls are done and analysis continues.`);
      } else if (!canceled.terminal) {
        output.progress(`Run ${runId} did not reach a final state within 10s.`);
      }
      if (bySignal) {
        reason = "canceled";
        exitCode = exitForSignal(bySignal);
      } else {
        const serverReason = (run?.reason as RunReason | null | undefined) ?? null;
        exitCode = exitForTimeout(run?.result ?? null, serverReason);
        reason =
          serverReason === "agent_failed" ||
          serverReason === "setup_error" ||
          serverReason === "tuner_error"
            ? serverReason
            : "timeout";
      }
    } else if (outcome.kind === "gave_up") {
      output.progress(
        `Tuner unreachable for 5 minutes (${outcome.error.message}). ${stillGoing(runId)}`,
      );
      reason = "tuner_error";
      exitCode = exitForRun(run?.result ?? null, "tuner_error");
    } else {
      const cli = toCliError(outcome.error, { runId });
      output.progress(`Could not read run ${runId}: ${cli.message} ${stillGoing(runId)}`);
      reason = cli.reason;
      exitCode = cli.exitCode;
    }
    return result({
      kind: "finished",
      run,
      reason,
      exitCode,
      terminal: outcome.kind === "terminal",
    });
  } finally {
    unsubscribe();
  }
}

/** The agent's run in progress (at most one), null if none, undefined if the lookup failed. */
async function findInFlightRun(
  api: TunerApi,
  workspaceId: number,
  agentId: number,
): Promise<number | null | undefined> {
  try {
    for (const status of ["pending", "running"] as const) {
      const { simulation_runs } = await api.searchRuns(workspaceId, agentId, status);
      if (simulation_runs[0]) return simulation_runs[0].id;
    }
    return null;
  } catch {
    return undefined;
  }
}

const stillGoing = (runId: number) =>
  `Run ${runId} may still be going; check it with \`tuner runs get ${runId}\`.`;
