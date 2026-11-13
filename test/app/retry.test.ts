import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffMs, withRetry } from "../../src/app/retry.js";
import { ApiError, GaveUpError, NetworkError } from "../../src/domain/errors.js";
import { FakeApi, makeRuntime } from "../helpers.js";

afterEach(() => vi.useRealTimers());

describe("withRetry", () => {
  it("backs off 3, 6, 12, 24 then caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5].map(backoffMs)).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
  });

  it("retries 5xx with backoff and returns the first success", async () => {
    vi.useFakeTimers();
    const rt = makeRuntime(new FakeApi());
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "run_start_failed", "x", {}, undefined))
      .mockRejectedValueOnce(new NetworkError("down"))
      .mockResolvedValue("ok");
    const p = withRetry(fn, { clock: rt, giveUpMs: 300_000, onRetry: (_e, d) => delays.push(d) });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await p).toBe("ok");
    expect(delays).toEqual([3000, 6000]);
  });

  it("honors Retry-After over the backoff", async () => {
    vi.useFakeTimers();
    const rt = makeRuntime(new FakeApi());
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(429, "rate_limited", "x", {}, 60))
      .mockResolvedValue("ok");
    const p = withRetry(fn, { clock: rt, giveUpMs: 300_000, onRetry: (_e, d) => delays.push(d) });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await p).toBe("ok");
    expect(delays).toEqual([60_000]);
  });

  it("gives up after the budget of consecutive failures", async () => {
    vi.useFakeTimers();
    const rt = makeRuntime(new FakeApi());
    const fn = vi.fn().mockRejectedValue(new ApiError(502, "internal_error", "x", {}, undefined));
    const p = withRetry(fn, { clock: rt, giveUpMs: 300_000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(299_000);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    const err = await p;
    expect(err).toBeInstanceOf(GaveUpError);
  });

  it("does not retry other 4xx", async () => {
    const rt = makeRuntime(new FakeApi());
    const fn = vi.fn().mockRejectedValue(new ApiError(404, "run_not_found", "x", {}, undefined));
    await expect(withRetry(fn, { clock: rt, giveUpMs: 300_000 })).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resolves undefined when aborted during a wait", async () => {
    vi.useFakeTimers();
    const rt = makeRuntime(new FakeApi());
    const ac = new AbortController();
    const fn = vi.fn().mockRejectedValue(new NetworkError("down"));
    const p = withRetry(fn, { clock: rt, giveUpMs: 300_000, signal: ac.signal });
    await vi.advanceTimersByTimeAsync(1_000);
    ac.abort();
    expect(await p).toBeUndefined();
  });
});
