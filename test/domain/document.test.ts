import { describe, expect, it } from "vitest";
import { buildDocument, listDocument, scenarioName } from "../../src/domain/document.js";
import { summarize } from "../../src/domain/run-summary.js";
import { call, defaultAgent, makeRun } from "../helpers.js";

describe("summarize", () => {
  it("counts the server's verdicts", () => {
    const run = makeRun({
      simulation_calls: [
        call({ verdict: "passed" }),
        call({ verdict: "ran" }),
        call({ verdict: "failed" }),
        call({ verdict: "not_connected" }),
        call({ verdict: "setup_error" }),
        call({ verdict: "analysis_failed" }),
        call({ verdict: "canceled" }),
        call({ verdict: "pending" }),
      ],
    });
    expect(summarize(run)).toEqual({
      total: 8,
      passed: 2,
      failed: 1,
      inconclusive: 3,
      canceled: 1,
      pending: 1,
    });
  });

  it("is all zeros without a run", () => {
    expect(summarize(undefined).total).toBe(0);
  });
});

describe("scenarioName", () => {
  it("prefers the persona, then the clip set, then the ID", () => {
    expect(scenarioName(call({ persona: "P" }))).toBe("P");
    expect(scenarioName(call({ persona: null, clip_set_name: "Clips" }))).toBe("Clips");
    expect(scenarioName(call({ persona: null, clip_set_name: null, scenario_id: 9 }))).toBe(
      "Scenario 9",
    );
  });
});

describe("buildDocument", () => {
  it("has no run part when nothing started", () => {
    const doc = buildDocument({ reason: "usage_error", exitCode: 2 });
    expect(doc).toMatchObject({ schema_version: 1, run: null, scenarios: [], exit_code: 2 });
    expect(doc).not.toHaveProperty("error");
  });

  it("keeps the run ID when Get a run never answered", () => {
    const doc = buildDocument({ runId: 5, reason: null, exitCode: 0 });
    expect(doc.run).toMatchObject({ id: 5, status: null, is_terminal: false, agent: null });
  });

  it("reports a null noise_intensity when the run has none", () => {
    const run = makeRun({ noise_environment: null, noise_intensity: null });
    const doc = buildDocument({ run, reason: null, exitCode: 0 });
    expect(doc.run).toMatchObject({
      config: { language: "en-US", profile: null, noise: null, noise_intensity: null },
    });
  });

  it("maps the run, agent and scenarios", () => {
    const doc = buildDocument({
      run: makeRun(),
      workspace: { id: 1, name: "W" },
      agent: defaultAgent,
      reason: null,
      exitCode: 0,
      error: { code: "x", message: "m" },
    });
    expect(doc.run).toMatchObject({
      agent: { id: defaultAgent.id, remote_id: "booking-staging", name: "Booking (staging)" },
      config: { language: "en-US", profile: null, noise: "cafe", noise_intensity: 1 },
    });
    expect(doc.scenarios).toEqual([
      {
        scenario_id: 311,
        library_scenario_id: 42,
        name: "Reschedule an existing booking",
        verdict: "passed",
        failure_category: null,
        failed_evals: [],
        call_id: 5001,
      },
    ]);
    expect(doc.error).toEqual({ code: "x", message: "m" });
  });
});

describe("listDocument", () => {
  it("wraps items under their key", () => {
    expect(listDocument("agents", [1])).toEqual({ schema_version: 1, agents: [1] });
  });
});
