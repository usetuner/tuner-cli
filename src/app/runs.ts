import type { GlobalFlags } from "../domain/config.js";
import type { Run } from "../domain/types.js";
import type { AppDeps } from "../ports.js";
import { SHORT_GIVE_UP_MS, withRetry } from "./retry.js";
import { type Target, resolveTarget } from "./target.js";

export interface RunInput {
  flags: GlobalFlags;
  agent?: string;
  runId: number;
}

const target = (deps: AppDeps, input: RunInput) =>
  resolveTarget(deps, {
    flags: input.flags,
    agent: input.agent,
    needAgent: true,
    giveUpMs: SHORT_GIVE_UP_MS,
  });

export async function getRun(
  deps: AppDeps,
  input: RunInput,
): Promise<{ run: Run; target: Target }> {
  const t = await target(deps, input);
  const run = (await withRetry(() => t.api.getRun(t.workspace.id, t.agent!.id, input.runId), {
    clock: deps.clock,
    giveUpMs: SHORT_GIVE_UP_MS,
  }))!;
  return { run, target: t };
}

/** One cancel request, no retry: the server answers with the run's state. */
export async function cancelRun(
  deps: AppDeps,
  input: RunInput,
): Promise<{ run: Run; target: Target }> {
  const t = await target(deps, input);
  const run = await t.api.cancelRun(t.workspace.id, t.agent!.id, input.runId);
  return { run, target: t };
}
