import { POLL_GIVE_UP_MS, withRetry } from "./retry.js";
import { ApiError, GaveUpError, NetworkError } from "../domain/errors.js";
import type { Signal } from "../domain/exit.js";
import type { Clock, TunerApi } from "../ports.js";
import type { Run } from "../domain/types.js";

export const POLL_INTERVAL_MS = 3_000;
export const CANCEL_WAIT_MS = 10_000;
const CANCEL_POLL_MS = 2_000;

export interface RunRef {
  api: TunerApi;
  workspaceId: number;
  agentId: number;
  runId: number;
}

/** First SIGINT/SIGTERM or the --timeout deadline interrupts polling. */
export class StopController {
  private readonly controller = new AbortController();
  signal?: Signal;
  timedOut = false;

  get abortSignal(): AbortSignal {
    return this.controller.signal;
  }

  get stopped(): boolean {
    return this.controller.signal.aborted;
  }

  stopBySignal(signal: Signal): void {
    if (this.stopped) return;
    this.signal = signal;
    this.controller.abort();
  }

  stopByTimeout(): void {
    if (this.stopped) return;
    this.timedOut = true;
    this.controller.abort();
  }
}

export type PollOutcome =
  | { kind: "terminal"; run: Run }
  | { kind: "stopped"; run?: Run }
  | { kind: "gave_up"; run?: Run; error: ApiError | NetworkError }
  | { kind: "error"; run?: Run; error: unknown };

export interface PollOptions extends RunRef {
  clock: Clock;
  stop: StopController;
  onUpdate(run: Run): void;
  onRetry?(err: ApiError | NetworkError, delayMs: number): void;
  intervalMs?: number;
  giveUpMs?: number;
}

/** Polls Get a run until it is terminal, stopped, or retries run out. */
export async function pollRun(opts: PollOptions): Promise<PollOutcome> {
  const { clock, stop } = opts;
  let last: Run | undefined;
  for (;;) {
    if (stop.stopped) return { kind: "stopped", run: last };
    let run: Run | undefined;
    try {
      run = await withRetry(
        (signal) => opts.api.getRun(opts.workspaceId, opts.agentId, opts.runId, signal),
        {
          clock,
          giveUpMs: opts.giveUpMs ?? POLL_GIVE_UP_MS,
          signal: stop.abortSignal,
          onRetry: opts.onRetry,
        },
      );
    } catch (err) {
      if (err instanceof GaveUpError) return { kind: "gave_up", run: last, error: err.lastError };
      return { kind: "error", run: last, error: err };
    }
    if (!run) return { kind: "stopped", run: last };
    last = run;
    opts.onUpdate(run);
    if (run.is_terminal) return { kind: "terminal", run };
    await clock.sleep(opts.intervalMs ?? POLL_INTERVAL_MS, stop.abortSignal);
  }
}

export interface CancelOutcome {
  run?: Run;
  /** The run reached a terminal state within the wait. */
  terminal: boolean;
  error?: unknown;
}

/** Cancels the run, then waits up to 10 s for a terminal state. `analyzing` returns at once. */
export async function cancelAndWait(
  ref: RunRef & { clock: Clock; waitMs?: number },
): Promise<CancelOutcome> {
  const { clock } = ref;
  const deadline = clock.now() + (ref.waitMs ?? CANCEL_WAIT_MS);
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), Math.max(0, deadline - clock.now()));
  try {
    let run: Run | undefined;
    try {
      run = await withRetry(() => ref.api.cancelRun(ref.workspaceId, ref.agentId, ref.runId), {
        clock,
        giveUpMs: ref.waitMs ?? CANCEL_WAIT_MS,
        signal: budget.signal,
      });
    } catch (err) {
      return { terminal: false, error: err };
    }
    if (!run) return { terminal: false };
    while (!run.is_terminal && run.status !== "analyzing" && clock.now() < deadline) {
      await clock.sleep(Math.min(CANCEL_POLL_MS, deadline - clock.now()), budget.signal);
      if (budget.signal.aborted) break;
      try {
        run = await ref.api.getRun(ref.workspaceId, ref.agentId, ref.runId, budget.signal);
      } catch {
        // keep the last known state; the deadline bounds the loop
      }
    }
    return { run, terminal: run.is_terminal };
  } finally {
    clearTimeout(timer);
  }
}
