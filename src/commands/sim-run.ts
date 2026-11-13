import { POLL_GIVE_UP_MS, withRetry } from "../client.js";
import { type Target, resolveTarget, toCliError } from "../context.js";
import { parseDuration } from "../duration.js";
import { CliError, detailText } from "../errors.js";
import { EXIT, type RunReason, exitForRun, exitForSignal } from "../exit.js";
import { StopController, cancelAndWait, pollRun } from "../poller.js";
import {
  type OutputFormat,
  buildDocument,
  painter,
  scenarioLine,
  summarize,
  summaryLine,
  useColor,
  writeJson,
} from "../render.js";
import type { Run, StartRunRequest, Verdict } from "../types.js";
import type { CommandContext } from "./shared.js";

export interface SimRunOptions {
  tag?: string;
  scenario?: string[];
  agent?: string;
  language?: string;
  profile?: string;
  noise?: string;
  output?: OutputFormat;
  wait?: boolean;
  timeout?: string;
  failOnInconclusive?: boolean;
}

export const DEFAULT_TIMEOUT = "60m";

export function parseScenarioIds(values: string[]): number[] {
  const ids = values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  for (const id of ids) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new CliError(`Invalid scenario ID '${id}'. Use numeric IDs from \`tuner scenarios list\`.`, "usage_error");
    }
  }
  return ids.map(Number);
}

export async function simRun(ctx: CommandContext, opts: SimRunOptions): Promise<number> {
  const { runtime } = ctx;
  const json = opts.output === "json";
  const failOnInconclusive = Boolean(opts.failOnInconclusive);
  const progress = (line: string) => runtime.stderr.write(line + "\n");
  const resultStream = json ? runtime.stderr : runtime.stdout;
  const paint = painter(useColor(resultStream, runtime));

  const stop = new StopController();
  let runId: number | undefined;
  let target: Target | undefined;
  const unsubscribe = runtime.onSignal((signal) => {
    if (stop.stopped) {
      progress(
        runId !== undefined
          ? `Stopped. Run ${runId} may still be going; check it with \`tuner runs get ${runId}\`.`
          : "Stopped.",
      );
      runtime.exit(exitForSignal(signal));
    }
    stop.stopBySignal(signal);
  });

  const finish = (input: {
    run?: Run;
    reason: string | null;
    exitCode: number;
    error?: { code: string; message: string; [key: string]: unknown };
  }): number => {
    if (json) {
      writeJson(
        runtime.stdout,
        buildDocument({
          ...input,
          runId,
          workspace: target?.workspace,
          agent: target?.agent,
        }),
      );
    }
    return input.exitCode;
  };

  const fail = (err: unknown, tag?: string): number => {
    if (stop.signal) return finish({ reason: "canceled", exitCode: exitForSignal(stop.signal) });
    const cli = toCliError(err, { tag, agentRef: opts.agent });
    progress(`Error: ${cli.message}`);
    if (cli.reason === "tuner_error") {
      const exitCode = exitForRun(null, "tuner_error", failOnInconclusive);
      warnInconclusive(progress, "tuner_error", exitCode);
      return finish({ reason: "tuner_error", exitCode, error: { code: "tuner_error", message: cli.message } });
    }
    return finish({
      reason: cli.reason,
      exitCode: cli.exitCode,
      error: { code: cli.reason, message: cli.message, ...cli.extra },
    });
  };

  try {
    let body: StartRunRequest;
    let timeoutMs: number;
    try {
      body = buildStartBody(opts);
      timeoutMs = parseTimeout(opts.timeout ?? DEFAULT_TIMEOUT);
      target = await resolveTarget({
        ...ctx,
        agent: opts.agent,
        needAgent: true,
        giveUpMs: POLL_GIVE_UP_MS,
        signal: stop.abortSignal,
      });
    } catch (err) {
      return fail(err);
    }
    const { client, workspace } = target;
    const agent = target.agent!;
    progress(`Workspace: ${workspace.name} · Agent: ${agent.remote_identifier}`);

    let started;
    try {
      // The POST itself is not aborted by a signal, so a run it creates can still be canceled.
      started = await withRetry(() => client.startRun(workspace.id, agent.id, body), {
        runtime,
        giveUpMs: POLL_GIVE_UP_MS,
        signal: stop.abortSignal,
        onRetry: (err, delay) => progress(`Tuner unavailable (${err.message}); retrying in ${Math.round(delay / 1000)}s...`),
      });
    } catch (err) {
      return fail(err, opts.tag);
    }
    if (!started) return finish({ reason: "canceled", exitCode: exitForSignal(stop.signal ?? "SIGINT") });
    runId = started.simulation_run_id;
    progress(`Running ${started.generated_count} scenarios (run ${runId})...`);

    const ref = { client, workspaceId: workspace.id, agentId: agent.id, runId, runtime };

    if (opts.wait === false) {
      let run: Run | undefined;
      try {
        run = await client.getRun(workspace.id, agent.id, runId);
      } catch {
        // the run started; the URL is a convenience
      }
      if (!json) runtime.stdout.write(`${runId}\n${run?.dashboard_url ? run.dashboard_url + "\n" : ""}`);
      return finish({ run, reason: null, exitCode: EXIT.OK });
    }

    const printed = new Map<number, Verdict>();
    const printNew = (run: Run | undefined) => {
      for (const call of run?.simulation_calls ?? []) {
        if (call.verdict === "pending" || printed.get(call.scenario_id) === call.verdict) continue;
        printed.set(call.scenario_id, call.verdict);
        resultStream.write(scenarioLine(call, paint) + "\n");
      }
    };

    let outcome;
    if (stop.stopped) {
      outcome = { kind: "stopped" as const, run: undefined };
    } else {
      const timer = setTimeout(() => stop.stopByTimeout(), timeoutMs);
      try {
        outcome = await pollRun({
          ...ref,
          stop,
          onUpdate: printNew,
          onRetry: (err, delay) => progress(`Tuner unavailable (${err.message}); retrying in ${Math.round(delay / 1000)}s...`),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    let run = outcome.run;
    let reason: RunReason | null;
    let exitCode: number;
    if (outcome.kind === "terminal") {
      run = outcome.run;
      reason = (run.reason as RunReason | null) ?? null;
      exitCode = exitForRun(run.result, reason, failOnInconclusive);
    } else if (outcome.kind === "stopped") {
      const bySignal = stop.signal;
      progress(
        bySignal
          ? `Canceling run ${runId}...`
          : `Timeout of ${opts.timeout ?? DEFAULT_TIMEOUT} reached. Canceling run ${runId}...`,
      );
      const canceled = await cancelAndWait(ref);
      run = canceled.run ?? run;
      if (canceled.error) {
        progress(`Could not cancel run ${runId}: ${canceled.error instanceof Error ? canceled.error.message : String(canceled.error)}. It may still be running.`);
      } else if (run?.status === "analyzing") {
        progress(`Run ${runId} is analyzing: its calls are done and analysis continues.`);
      } else if (!canceled.terminal) {
        progress(`Run ${runId} did not reach a final state within 10s.`);
      }
      reason = bySignal ? "canceled" : "timeout";
      exitCode = bySignal ? exitForSignal(bySignal) : exitForRun(null, "timeout", failOnInconclusive);
    } else {
      const message = outcome.kind === "gave_up"
        ? `Tuner unreachable for 5 minutes (${outcome.error.message}).`
        : `Could not read run ${runId}: ${toCliError(outcome.error).message}`;
      progress(`${message} Run ${runId} may still be going; check it with \`tuner runs get ${runId}\`.`);
      reason = "tuner_error";
      exitCode = exitForRun(null, "tuner_error", failOnInconclusive);
    }

    printNew(run);
    if (!json) {
      runtime.stdout.write(`\n${summaryLine(summarize(run))}\n`);
      if (run?.dashboard_url) runtime.stdout.write(`${run.dashboard_url}\n`);
    } else if (run?.dashboard_url) {
      progress(run.dashboard_url);
    }
    if (reason && reason !== "agent_failed" && exitCode !== EXIT.SIGINT && exitCode !== EXIT.SIGTERM) {
      warnInconclusive(progress, reason, exitCode);
    } else if (reason === "agent_failed") {
      progress("Result: failed (agent_failed)");
    }
    return finish({ run, reason, exitCode });
  } finally {
    unsubscribe();
  }
}

function warnInconclusive(progress: (line: string) => void, reason: string, exitCode: number): void {
  const hint = exitCode === EXIT.OK ? " Pass --fail-on-inconclusive to exit 1 instead." : "";
  progress(`Warning: run not conclusive (reason: ${reason}); exiting ${exitCode}.${hint}`);
}

function parseTimeout(value: string): number {
  try {
    return parseDuration(value);
  } catch (err) {
    throw new CliError(detailText((err as Error).message), "usage_error");
  }
}

export function buildStartBody(opts: SimRunOptions): StartRunRequest {
  const scenarios = opts.scenario ?? [];
  if (Boolean(opts.tag) === scenarios.length > 0) {
    throw new CliError("Pass exactly one of --tag or --scenario.", "usage_error");
  }
  const body: StartRunRequest = {};
  if (opts.tag) body.tag = opts.tag;
  else body.selected_scenario_ids = parseScenarioIds(scenarios);
  if (opts.language) body.language = opts.language;
  if (opts.profile) body.profile = opts.profile;
  if (opts.noise) body.noise = opts.noise;
  return body;
}
