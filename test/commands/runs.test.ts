import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_PATH,
  FakeApi,
  RUN,
  apiError,
  json,
  makeRun,
  makeRuntime,
  pendingRun,
  run,
  whoami,
} from "../helpers.js";

const GET = `${AGENT_PATH}/simulation-runs/${RUN}`;
const CANCEL = `${GET}/cancel`;
afterEach(() => vi.useRealTimers());

const base = () => new FakeApi().on("GET", "/api/v1/whoami", json(200, whoami()));

describe("runs get", () => {
  it("prints the run in text", async () => {
    const rt = makeRuntime(base().on("GET", GET, json(200, makeRun())));
    expect(await run(rt, "runs", "get", String(RUN))).toBe(0);
    expect(rt.out()).toContain(
      `Run ${RUN} · completed · result passed\nNoise: cafe · intensity 1.0\n`,
    );
    expect(rt.out()).toContain("✓ passed");
    expect(rt.out()).toContain("https://app.usetuner.ai/simulations");
  });

  it("prints a Metadata line when the run has metadata", async () => {
    const meta = makeRun({ metadata: { commit: "abc", pr_url: "https://github.com/o/r/pull/1" } });
    const rt = makeRuntime(base().on("GET", GET, json(200, meta)));
    expect(await run(rt, "runs", "get", String(RUN))).toBe(0);
    expect(rt.out()).toContain(
      `Noise: cafe · intensity 1.0\nMetadata: commit=abc · pr_url=https://github.com/o/r/pull/1\n\n`,
    );
  });

  it("prints the JSON document", async () => {
    const rt = makeRuntime(base().on("GET", GET, json(200, makeRun())));
    expect(await run(rt, "runs", "get", String(RUN), "--output", "json")).toBe(0);
    const doc = JSON.parse(rt.out());
    expect(doc.schema_version).toBe(1);
    expect(doc.run.id).toBe(RUN);
    expect(doc.run.agent.remote_id).toBe("booking-staging");
    expect(doc.run.config.noise_intensity).toBe(1);
    expect(doc.run.metadata).toBeNull();
  });

  it("returns the run's metadata in the JSON document", async () => {
    const rt = makeRuntime(base().on("GET", GET, json(200, makeRun({ metadata: { env: "ci" } }))));
    expect(await run(rt, "runs", "get", String(RUN), "--output", "json")).toBe(0);
    expect(JSON.parse(rt.out()).run.metadata).toEqual({ env: "ci" });
  });

  it("exits 2 on run_not_found", async () => {
    const rt = makeRuntime(
      base().on("GET", GET, apiError(404, "run_not_found", "Simulation run not found")),
    );
    expect(await run(rt, "runs", "get", String(RUN))).toBe(2);
    expect(rt.err()).toContain("Run 4821 not found for this agent. Check the run ID and --agent.");
  });

  it("exits 2 on a bad run ID without calling the API", async () => {
    const api = base();
    const rt = makeRuntime(api);
    expect(await run(rt, "runs", "get", "abc")).toBe(2);
    expect(rt.err()).toContain("Invalid run ID 'abc'");
    expect(api.requests).toHaveLength(0);
  });

  it("exits 2 without an agent", async () => {
    const rt = makeRuntime(base(), { env: { TUNER_AGENT_ID: undefined } });
    expect(await run(rt, "runs", "get", "1")).toBe(2);
  });
});

describe("runs cancel", () => {
  it("cancels a running run", async () => {
    const api = base().on(
      "POST",
      CANCEL,
      json(200, makeRun({ status: "canceled", result: "canceled", reason: "canceled" })),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "runs", "cancel", String(RUN))).toBe(0);
    expect(rt.out()).toContain(`Run ${RUN} canceled.`);
    expect(api.calls("POST", CANCEL)).toHaveLength(1);
  });

  it("says analysis continues for an analyzing run", async () => {
    const rt = makeRuntime(
      base().on("POST", CANCEL, json(200, pendingRun({ status: "analyzing" }))),
    );
    expect(await run(rt, "runs", "cancel", String(RUN))).toBe(0);
    expect(rt.out()).toContain("analysis continues");
    expect(rt.out()).toContain("https://app.usetuner.ai/simulations?agent=77&run=4821");
  });

  it("reports an already finished run", async () => {
    const rt = makeRuntime(base().on("POST", CANCEL, json(200, makeRun())));
    expect(await run(rt, "runs", "cancel", String(RUN))).toBe(0);
    expect(rt.out()).toContain("already finished: status completed, result passed");
  });

  it("exits 2 on run_not_found", async () => {
    const rt = makeRuntime(
      base().on("POST", CANCEL, apiError(404, "run_not_found", "Simulation run not found")),
    );
    expect(await run(rt, "runs", "cancel", String(RUN))).toBe(2);
  });

  it("retries a cancel that hit a busy run (503), since cancel is idempotent", async () => {
    vi.useFakeTimers();
    const api = base().on(
      "POST",
      CANCEL,
      apiError(503, "internal_error", "Another request was updating the run"),
      json(200, makeRun({ status: "canceled", result: "canceled", reason: "canceled" })),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "runs", "cancel", String(RUN));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toBe(0);
    expect(api.calls("POST", CANCEL)).toHaveLength(2);
  });

  it("exits 3 when the cancel keeps failing", async () => {
    vi.useFakeTimers();
    const api = base().on("POST", CANCEL, apiError(503, "internal_error", "busy"));
    const rt = makeRuntime(api);
    const p = run(rt, "runs", "cancel", String(RUN));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await p).toBe(3);
    expect(rt.err()).toContain("Tuner kept failing (503 internal_error), and retries ran out.");
  });

  it("prints JSON", async () => {
    const rt = makeRuntime(
      base().on(
        "POST",
        CANCEL,
        json(200, makeRun({ status: "canceled", result: "canceled", reason: "canceled" })),
      ),
    );
    expect(await run(rt, "runs", "cancel", String(RUN), "--output", "json")).toBe(0);
    expect(JSON.parse(rt.out()).reason).toBe("canceled");
  });
});
