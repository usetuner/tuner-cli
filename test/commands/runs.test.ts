import { describe, expect, it } from "vitest";
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

  it("prints the JSON document", async () => {
    const rt = makeRuntime(base().on("GET", GET, json(200, makeRun())));
    expect(await run(rt, "runs", "get", String(RUN), "--output", "json")).toBe(0);
    const doc = JSON.parse(rt.out());
    expect(doc.schema_version).toBe(1);
    expect(doc.run.id).toBe(RUN);
    expect(doc.run.agent.remote_id).toBe("booking-staging");
    expect(doc.run.config.noise_intensity).toBe(1);
  });

  it("exits 2 on run_not_found", async () => {
    const rt = makeRuntime(
      base().on("GET", GET, apiError(404, "run_not_found", "Simulation run not found")),
    );
    expect(await run(rt, "runs", "get", String(RUN))).toBe(2);
    expect(rt.err()).toContain("Simulation run not found");
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
