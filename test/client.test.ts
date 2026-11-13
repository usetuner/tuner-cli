import { afterEach, describe, expect, it, vi } from "vitest";
import { TunerClient, backoffMs, withRetry } from "../src/client.js";
import { ApiError, GaveUpError, NetworkError } from "../src/errors.js";
import { VERSION } from "../src/version.js";
import { AGENT_PATH, BASE, FakeApi, RUN, apiError, json, makeRuntime, networkError } from "./helpers.js";

afterEach(() => vi.useRealTimers());

const client = (api: FakeApi) =>
  new TunerClient({ baseUrl: BASE, apiKey: "tr_api_k", runtime: makeRuntime(api) });

describe("TunerClient", () => {
  it("sends auth and X-Tuner-Client on every request", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, {}));
    await client(api).whoami("booking-staging");
    const req = api.requests[0]!;
    expect(req.headers.authorization).toBe("Bearer tr_api_k");
    expect(req.headers["x-tuner-client"]).toBe(`cli/${VERSION}`);
    expect(req.url.origin).toBe(BASE);
    expect(req.url.searchParams.get("agent_remote_identifier")).toBe("booking-staging");
  });

  it("omits the agent query when not given", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, {}));
    await client(api).whoami();
    expect(api.requests[0]!.url.search).toBe("");
  });

  it("parses the error envelope, list detail and extra fields", async () => {
    const api = new FakeApi().on(
      "POST",
      `${AGENT_PATH}/simulation-runs/select`,
      apiError(409, "run_in_flight", "busy", { run_id: 4820, dashboard_url: "u" }),
    );
    const err = await client(api).startRun(12, 77, { tag: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("run_in_flight");
    expect(err.body.run_id).toBe(4820);
    expect(err.retryable).toBe(false);
  });

  it("falls back to a code by status when the body has none", async () => {
    const api = new FakeApi().on(
      "GET",
      `${AGENT_PATH}/simulation-runs/${RUN}`,
      new Response("Internal Server Error", { status: 500 }),
    );
    const err = await client(api).getRun(12, 77, RUN).catch((e) => e);
    expect(err.code).toBe("internal_error");
    expect(err.retryable).toBe(true);
  });

  it("reads Retry-After", async () => {
    const api = new FakeApi().on(
      "GET",
      `${AGENT_PATH}/simulation-runs/${RUN}`,
      apiError(429, "rate_limited", "slow down", {}, { "retry-after": "60" }),
    );
    const err = await client(api).getRun(12, 77, RUN).catch((e) => e);
    expect(err.retryAfterSeconds).toBe(60);
  });

  it("wraps network failures", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", networkError());
    const err = await client(api).whoami().catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toContain("ECONNREFUSED");
  });

  it("logs requests with --verbose", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, {}, { "x-request-id": "req-1" }));
    const rt = makeRuntime(api);
    await new TunerClient({ baseUrl: BASE, apiKey: "k", runtime: rt, verbose: true }).whoami();
    expect(rt.err()).toMatch(/\[http\] GET \/api\/v1\/whoami 200 \d+ms request-id=req-1/);
  });
});

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
    const p = withRetry(fn, { runtime: rt, giveUpMs: 300_000, onRetry: (_e, d) => delays.push(d) });
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
    const p = withRetry(fn, { runtime: rt, giveUpMs: 300_000, onRetry: (_e, d) => delays.push(d) });
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
    const p = withRetry(fn, { runtime: rt, giveUpMs: 300_000 }).catch((e) => e);
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
    await expect(withRetry(fn, { runtime: rt, giveUpMs: 300_000 })).rejects.toBeInstanceOf(ApiError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resolves undefined when aborted during a wait", async () => {
    vi.useFakeTimers();
    const rt = makeRuntime(new FakeApi());
    const ac = new AbortController();
    const fn = vi.fn().mockRejectedValue(new NetworkError("down"));
    const p = withRetry(fn, { runtime: rt, giveUpMs: 300_000, signal: ac.signal });
    await vi.advanceTimersByTimeAsync(1_000);
    ac.abort();
    expect(await p).toBeUndefined();
  });
});
