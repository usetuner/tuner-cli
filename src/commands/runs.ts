import { writeJson } from "../adapters/json.js";
import { cancelText, writeRun } from "../adapters/terminal.js";
import { cancelRun, getRun } from "../app/runs.js";
import type { Target } from "../app/target.js";
import { type OutputFormat, buildDocument } from "../domain/document.js";
import { EXIT } from "../domain/exit.js";
import { parseRunId } from "../domain/inputs.js";
import type { Run } from "../domain/types.js";
import { type CommandContext, guard, isJson } from "./shared.js";

interface RunsOptions {
  agent?: string;
  output?: OutputFormat;
}

function writeDocument(ctx: CommandContext, run: Run, t: Target): void {
  writeJson(
    ctx.runtime.stdout,
    buildDocument({
      run,
      workspace: t.workspace,
      agent: t.agent,
      reason: run.reason ?? null,
      exitCode: EXIT.OK,
    }),
  );
}

export function runsGet(ctx: CommandContext, id: string, opts: RunsOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const runId = parseRunId(id);
    const { run, target } = await getRun(ctx.deps, { flags: ctx.flags, agent: opts.agent, runId });
    if (isJson(opts.output)) writeDocument(ctx, run, target);
    else writeRun(ctx.runtime, run);
    return EXIT.OK;
  });
}

export function runsCancel(ctx: CommandContext, id: string, opts: RunsOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const runId = parseRunId(id);
    const { run, target } = await cancelRun(ctx.deps, {
      flags: ctx.flags,
      agent: opts.agent,
      runId,
    });
    if (isJson(opts.output)) writeDocument(ctx, run, target);
    else ctx.runtime.stdout.write(cancelText(run));
    return EXIT.OK;
  });
}
