import { writeJson } from "../adapters/json.js";
import { noiseLine, summaryLine, terminalOutput } from "../adapters/terminal.js";
import { runSimulation } from "../app/sim-run.js";
import { type OutputFormat, buildDocument } from "../domain/document.js";
import { EXIT } from "../domain/exit.js";
import { summarize } from "../domain/run-summary.js";
import type { Output } from "../ports.js";
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
  failOnInconclusive?: boolean;
}

export async function simRun(ctx: CommandContext, opts: SimRunOptions): Promise<number> {
  const { runtime } = ctx;
  const json = opts.output === "json";
  const output = terminalOutput(runtime, json);
  const r = await runSimulation(
    { ...ctx.deps, signals: runtime, output },
    {
      flags: ctx.flags,
      agent: opts.agent,
      start: opts,
      wait: opts.wait !== false,
      timeout: opts.timeout,
      failOnInconclusive: Boolean(opts.failOnInconclusive),
    },
  );

  if (r.kind === "error") {
    output.progress(`Error: ${r.error?.message}`);
    if (r.reason === "tuner_error") warnInconclusive(output, "tuner_error", r.exitCode);
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
    if (
      reason &&
      reason !== "agent_failed" &&
      exitCode !== EXIT.SIGINT &&
      exitCode !== EXIT.SIGTERM
    ) {
      warnInconclusive(output, reason, exitCode);
    } else if (reason === "agent_failed") {
      output.progress("Result: failed (agent_failed)");
    }
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

function warnInconclusive(output: Output, reason: string, exitCode: number): void {
  const hint = exitCode === EXIT.OK ? " Pass --fail-on-inconclusive to exit 1 instead." : "";
  output.progress(`Warning: run not conclusive (reason: ${reason}); exiting ${exitCode}.${hint}`);
}
