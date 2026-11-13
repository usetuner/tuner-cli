import { ApiError, GaveUpError, NetworkError, isRetryable } from "../domain/errors.js";
import type { Clock } from "../ports.js";

export const POLL_GIVE_UP_MS = 5 * 60_000;
/** Retry budget for commands other than `sim run`. */
export const SHORT_GIVE_UP_MS = 30_000;
const BACKOFF_MS = [3_000, 6_000, 12_000, 24_000];
const BACKOFF_CAP_MS = 30_000;

export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MS[attempt] ?? BACKOFF_CAP_MS, BACKOFF_CAP_MS);
}

export interface RetryOptions {
  clock: Clock;
  giveUpMs: number;
  signal?: AbortSignal;
  onRetry?: (err: ApiError | NetworkError, delayMs: number) => void;
}

/**
 * Retries 429, 5xx and network errors with backoff 3, 6, 12 s capped at 30 s, honoring
 * Retry-After, until `giveUpMs` of consecutive failures. Resolves `undefined` if aborted.
 */
export async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  opts: RetryOptions,
): Promise<T | undefined> {
  let firstFailureAt: number | undefined;
  let attempt = 0;
  for (;;) {
    if (opts.signal?.aborted) return undefined;
    try {
      return await fn(opts.signal);
    } catch (err) {
      if (opts.signal?.aborted) return undefined;
      if (!isRetryable(err)) throw err;
      const now = opts.clock.now();
      firstFailureAt ??= now;
      if (now - firstFailureAt >= opts.giveUpMs) throw new GaveUpError(err);
      const fromHeader =
        err instanceof ApiError && err.retryAfterSeconds !== undefined
          ? err.retryAfterSeconds * 1000
          : undefined;
      const delay = fromHeader ?? backoffMs(attempt);
      attempt += 1;
      opts.onRetry?.(err, delay);
      await opts.clock.sleep(delay, opts.signal);
    }
  }
}
