import { withRetry } from "../client.js";
import { resolveTarget } from "../context.js";
import { EXIT } from "../domain/exit.js";
import { type OutputFormat, buildDocument } from "../domain/document.js";
import { summarize } from "../domain/run-summary.js";
import { painter, scenarioLine, summaryLine, useColor, writeJson } from "../render.js";
import type { Run } from "../domain/types.js";
import { parseRunId } from "../domain/inputs.js";
import { type CommandContext, SHORT_GIVE_UP_MS, guard, isJson } from "./shared.js";

interface RunsOptions {
  agent?: string;
  output?: OutputFormat;
}

function printRun(ctx: CommandContext, run: Run): void {
  const { stdout } = ctx.runtime;
  const paint = painter(useColor(stdout, ctx.runtime));
  const reason = run.reason ? ` (${run.reason})` : "";
  stdout.write(`Run ${run.id} · ${run.status} · result ${run.result}${reason}\n\n`);
  for (const call of run.simulation_calls) stdout.write(scenarioLine(call, paint) + "\n");
  stdout.write(`\n${summaryLine(summarize(run))}\n${run.dashboard_url}\n`);
}

export function runsGet(ctx: CommandContext, id: string, opts: RunsOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const runId = parseRunId(id);
    const t = await resolveTarget({
      ...ctx,
      agent: opts.agent,
      needAgent: true,
      giveUpMs: SHORT_GIVE_UP_MS,
    });
    const run = (await withRetry(() => t.client.getRun(t.workspace.id, t.agent!.id, runId), {
      runtime: ctx.runtime,
      giveUpMs: SHORT_GIVE_UP_MS,
    }))!;
    if (isJson(opts.output)) {
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
    } else {
      printRun(ctx, run);
    }
    return EXIT.OK;
  });
}

export function runsCancel(ctx: CommandContext, id: string, opts: RunsOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const runId = parseRunId(id);
    const t = await resolveTarget({
      ...ctx,
      agent: opts.agent,
      needAgent: true,
      giveUpMs: SHORT_GIVE_UP_MS,
    });
    const run = await t.client.cancelRun(t.workspace.id, t.agent!.id, runId);
    if (isJson(opts.output)) {
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
      return EXIT.OK;
    }
    const { stdout } = ctx.runtime;
    if (run.status === "canceled") {
      stdout.write(`Run ${run.id} canceled.\n${run.dashboard_url}\n`);
    } else if (run.is_terminal) {
      stdout.write(
        `Run ${run.id} already finished: status ${run.status}, result ${run.result}.\n${run.dashboard_url}\n`,
      );
    } else {
      stdout.write(
        `Run ${run.id} is ${run.status}: its calls are done and analysis continues.\n${run.dashboard_url}\n`,
      );
    }
    return EXIT.OK;
  });
}
