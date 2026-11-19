import { writeJson } from "../adapters/json.js";
import { noiseLine, summaryLine, terminalOutput } from "../adapters/terminal.js";
import { runSimulation } from "../app/sim-run.js";
import { type OutputFormat, buildDocument } from "../domain/document.js";
import { EXIT } from "../domain/exit.js";
import { runEndMessage } from "../domain/run-end.js";
import { summarize } from "../domain/run-summary.js";
import type { CommandContext } from "./shared.js";

export interface SimRunOptions {
  tag?: string;
  scenario?: string[];
  agent?: string;
  language?: string;
  profile?: string;
  noise?: string;
  noiseIntensity?: string;
  output?: OutputFormat;
  wait?: boolean;
  timeout?: string;
  /** Deprecated no-op, kept for one minor version. */
  failOnInconclusive?: boolean;
}

export async function simRun(ctx: CommandContext, opts: SimRunOptions): Promise<number> {
  const { runtime } = ctx;
  const json = opts.output === "json";
  const output = terminalOutput(runtime, json);
  if (opts.failOnInconclusive) {
    runtime.stderr.write(
      "Warning: --fail-on-inconclusive is deprecated and has no effect; runs Tuner couldn't finish, timeouts included, now exit 3.\n",
    );
  }
  const r = await runSimulation(
    { ...ctx.deps, signals: runtime, output },
    {
      flags: ctx.flags,
      agent: opts.agent,
      start: opts,
      wait: opts.wait !== false,
      timeout: opts.timeout,
    },
  );

  if (r.kind === "error") {
    output.progress(`Error: ${r.error?.message}`);
    if (r.exitCode === EXIT.TUNER_FAULT) output.progress(tunerFault(r.reason));
  } else if (r.kind === "started" && !json) {
    runtime.stdout.write(`${r.runId}\n${r.run?.dashboard_url ? r.run.dashboard_url + "\n" : ""}`);
    const noise = noiseLine(r.run);
    if (noise) output.progress(noise);
  } else if (r.kind === "finished") {
    const { run, reason, exitCode } = r;
    output.run(run);
    if (!json) {
      const noise = noiseLine(run);
      if (noise) output.progress(noise);
      runtime.stdout.write(`\n${summaryLine(summarize(run))}\n`);
      if (run?.dashboard_url) runtime.stdout.write(`${run.dashboard_url}\n`);
    } else if (run?.dashboard_url) {
      output.progress(run.dashboard_url);
    }
    const end =
      r.terminal && r.runId !== undefined
        ? runEndMessage(r.runId, run?.result ?? null, reason)
        : exitCode === EXIT.TUNER_FAULT
          ? tunerFault(reason)
          : undefined;
    if (end) output.progress(end);
  }

  if (json) {
    writeJson(
      runtime.stdout,
      buildDocument({
        run: r.run,
        runId: r.runId,
        workspace: r.target?.workspace,
        agent: r.target?.agent,
        reason: r.reason,
        exitCode: r.exitCode,
        error: r.error,
      }),
    );
  }
  return r.exitCode;
}

const tunerFault = (reason: string | null) =>
  `Tuner couldn't finish this run (${reason ?? "tuner_error"}).`;
