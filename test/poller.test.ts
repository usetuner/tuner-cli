import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TunerClient } from "../src/adapters/http-client.js";
import { StopController, cancelAndWait, pollRun } from "../src/poller.js";
import type { Run } from "../src/domain/types.js";
import {
  AGENT,
  AGENT_PATH,
  BASE,
  FakeApi,
  RUN,
  WS,
  apiError,
  json,
  makeRun,
  makeRuntime,
  networkError,
  pendingRun,
} from "./helpers.js";

const GET = `${AGENT_PATH}/simulation-runs/${RUN}`;
const CANCEL = `${GET}/cancel`;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(api: FakeApi) {
  const runtime = makeRuntime(api);
  const client = new TunerClient({ baseUrl: BASE, apiKey: "k", runtime });
  return { runtime, client, ref: { client, workspaceId: WS, agentId: AGENT, runId: RUN, runtime } };
}

describe("pollRun", () => {
  it("polls every 3 s until the run is terminal", async () => {
    const api = new FakeApi().on(
      "GET",
      GET,
      json(200, pendingRun()),
      json(200, pendingRun()),
      json(200, makeRun()),
    );
    const { ref } = setup(api);
    const updates: Run[] = [];
    const p = pollRun({ ...ref, stop: new StopController(), onUpdate: (r) => updates.push(r) });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.calls("GET", GET)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(api.calls("GET", GET)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.calls("GET", GET)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3_000);
    const outcome = await p;
    expect(outcome.kind).toBe("terminal");
    expect(updates).toHaveLength(3);
  });

  it("backs off 3, 6, 12 s on 5xx, 429 and network errors, then recovers", async () => {
    const api = new FakeApi().on(
      "GET",
      GET,
      apiError(503, "internal_error", "x"),
      networkError("ECONNRESET"),
      apiError(429, "rate_limited", "x"),
      json(200, makeRun()),
    );
    const { ref } = setup(api);
    const delays: number[] = [];
    const p = pollRun({
      ...ref,
      stop: new StopController(),
      onUpdate: () => {},
      onRetry: (_e, d) => delays.push(d),
    });
    await vi.advanceTimersByTimeAsync(21_000);
    expect((await p).kind).toBe("terminal");
    expect(delays).toEqual([3_000, 6_000, 12_000]);
  });

  it("honors Retry-After", async () => {
    const api = new FakeApi().on(
      "GET",
      GET,
      apiError(429, "rate_limited", "x", {}, { "retry-after": "45" }),
      json(200, makeRun()),
    );
    const { ref } = setup(api);
    const p = pollRun({ ...ref, stop: new StopController(), onUpdate: () => {} });
    await vi.advanceTimersByTimeAsync(44_000);
    expect(api.calls("GET", GET)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await p).kind).toBe("terminal");
  });

  it("gives up after 5 minutes of consecutive failures", async () => {
    const api = new FakeApi().on(
      "GET",
      GET,
      json(200, pendingRun()),
      apiError(502, "internal_error", "x"),
    );
    const { ref } = setup(api);
    const p = pollRun({ ...ref, stop: new StopController(), onUpdate: () => {} });
    await vi.advanceTimersByTimeAsync(3_000 + 290_000);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    const outcome = await p;
    expect(outcome.kind).toBe("gave_up");
    expect(outcome.run?.status).toBe("running");
  });

  it("resets the failure window after a success", async () => {
    const replies = [
      ...Array(9).fill(apiError(503, "internal_error", "x")),
      json(200, pendingRun()),
      ...Array(9).fill(apiError(503, "internal_error", "x")),
      json(200, makeRun()),
    ];
    const api = new FakeApi().on("GET", GET, ...replies);
    const { ref } = setup(api);
    const p = pollRun({ ...ref, stop: new StopController(), onUpdate: () => {} });
    await vi.advanceTimersByTimeAsync(600_000);
    expect((await p).kind).toBe("terminal");
  });

  it("returns stopped on a signal, without waiting for the interval", async () => {
    const api = new FakeApi().on("GET", GET, json(200, pendingRun()));
    const { ref } = setup(api);
    const stop = new StopController();
    const p = pollRun({ ...ref, stop, onUpdate: () => {} });
    await vi.advanceTimersByTimeAsync(1_000);
    stop.stopBySignal("SIGINT");
    const outcome = await p;
    expect(outcome.kind).toBe("stopped");
    expect(stop.signal).toBe("SIGINT");
    expect(outcome.run?.status).toBe("running");
  });

  it("returns error on a non-retryable response", async () => {
    const api = new FakeApi().on("GET", GET, apiError(404, "run_not_found", "Run not found"));
    const { ref } = setup(api);
    const outcome = await pollRun({ ...ref, stop: new StopController(), onUpdate: () => {} });
    expect(outcome.kind).toBe("error");
  });
});

describe("cancelAndWait", () => {
  it("returns at once when cancel returns a terminal run", async () => {
    const api = new FakeApi().on(
      "POST",
      CANCEL,
      json(200, makeRun({ status: "canceled", result: "canceled", reason: "canceled" })),
    );
    const { ref } = setup(api);
    const outcome = await cancelAndWait(ref);
    expect(outcome.terminal).toBe(true);
    expect(api.calls("POST", CANCEL)).toHaveLength(1);
  });

  it("polls until terminal within 10 s", async () => {
    const api = new FakeApi()
      .on("POST", CANCEL, json(200, pendingRun()))
      .on(
        "GET",
        GET,
        json(200, pendingRun()),
        json(200, makeRun({ status: "canceled", result: "canceled" })),
      );
    const { ref } = setup(api);
    const p = cancelAndWait(ref);
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await p).terminal).toBe(true);
  });

  it("stops waiting after 10 s", async () => {
    const api = new FakeApi()
      .on("POST", CANCEL, json(200, pendingRun()))
      .on("GET", GET, json(200, pendingRun()));
    const { ref, runtime } = setup(api);
    const start = runtime.now();
    const p = cancelAndWait(ref);
    await vi.advanceTimersByTimeAsync(11_000);
    const outcome = await p;
    expect(outcome.terminal).toBe(false);
    expect(runtime.now() - start).toBeLessThanOrEqual(11_000);
    expect(api.calls("GET", GET).length).toBeLessThanOrEqual(5);
  });

  it("does not wait on an analyzing run", async () => {
    const api = new FakeApi().on("POST", CANCEL, json(200, pendingRun({ status: "analyzing" })));
    const { ref } = setup(api);
    const outcome = await cancelAndWait(ref);
    expect(outcome.terminal).toBe(false);
    expect(outcome.run?.status).toBe("analyzing");
    expect(api.calls("GET", GET)).toHaveLength(0);
  });

  it("reports a cancel error", async () => {
    const api = new FakeApi().on("POST", CANCEL, apiError(404, "run_not_found", "nope"));
    const { ref } = setup(api);
    const outcome = await cancelAndWait(ref);
    expect(outcome.error).toBeDefined();
  });
});
