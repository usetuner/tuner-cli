import type { GlobalFlags } from "../domain/config.js";
import { toCliError } from "../domain/error-message.js";
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

async function retried(deps: AppDeps, input: RunInput, fn: () => Promise<Run>): Promise<Run> {
  try {
    return (await withRetry(fn, { clock: deps.clock, giveUpMs: SHORT_GIVE_UP_MS }))!;
  } catch (err) {
    throw toCliError(err, { runId: input.runId });
  }
}

export async function getRun(
  deps: AppDeps,
  input: RunInput,
): Promise<{ run: Run; target: Target }> {
  const t = await target(deps, input);
  const run = await retried(deps, input, () =>
    t.api.getRun(t.workspace.id, t.agent!.id, input.runId),
  );
  return { run, target: t };
}

/** Cancel is idempotent (a finished run comes back unchanged), so it retries like a read. */
export async function cancelRun(
  deps: AppDeps,
  input: RunInput,
): Promise<{ run: Run; target: Target }> {
  const t = await target(deps, input);
  const run = await retried(deps, input, () =>
    t.api.cancelRun(t.workspace.id, t.agent!.id, input.runId),
  );
  return { run, target: t };
}
