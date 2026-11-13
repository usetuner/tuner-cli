import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_PATH,
  RUN,
  apiError,
  call,
  happyApi,
  json,
  makeRun,
  makeRuntime,
  pendingRun,
  run,
} from "../helpers.js";

const schema = JSON.parse(
  readFileSync(new URL("../../schema/run-result.v1.json", import.meta.url), "utf8"),
);
const validate = new Ajv({ allErrors: true }).compile(schema);
const SELECT = `${AGENT_PATH}/simulation-runs/select`;
const CANCEL = `${AGENT_PATH}/simulation-runs/${RUN}/cancel`;

afterEach(() => vi.useRealTimers());

function check(stdout: string) {
  const doc = JSON.parse(stdout);
  const ok = validate(doc);
  expect(validate.errors ?? []).toEqual([]);
  expect(ok).toBe(true);
  return doc;
}

describe("--output json matches schema_version 1", () => {
  it("passed run; stdout holds only the document", async () => {
    const rt = makeRuntime(happyApi());
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--output", "json")).toBe(0);
    const doc = check(rt.out());
    expect(doc).toMatchObject({
      schema_version: 1,
      run: {
        id: RUN,
        result: "passed",
        is_terminal: true,
        workspace: { id: 12, name: "Acme" },
        agent: { id: 77, remote_id: "booking-staging", name: "Booking (staging)" },
        config: { language: "en-US", profile: null, noise: "cafe" },
        started_at: "2026-11-04T10:00:00Z",
      },
      summary: { total: 1, passed: 1, failed: 0, inconclusive: 0, canceled: 0, pending: 0 },
      reason: null,
      exit_code: 0,
    });
    expect(doc.scenarios[0]).toEqual({
      scenario_id: 311,
      library_scenario_id: 42,
      name: "Reschedule an existing booking",
      verdict: "passed",
      failure_category: null,
      failed_evals: [],
      call_id: 5001,
    });
    expect(rt.err()).toContain("Workspace: Acme");
  });

  it("failed run", async () => {
    const failed = makeRun({
      result: "failed",
      reason: "agent_failed",
      simulation_calls: [
        call({
          verdict: "failed",
          failure_category: "agent_failed",
          failed_evals: [{ name: "Refund policy", value: "FAIL" }],
        }),
      ],
    });
    const rt = makeRuntime(happyApi(failed));
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--output", "json")).toBe(1);
    const doc = check(rt.out());
    expect(doc.reason).toBe("agent_failed");
    expect(doc.exit_code).toBe(1);
    expect(doc.scenarios[0].failed_evals).toEqual([{ name: "Refund policy", value: "FAIL" }]);
    expect(rt.err()).toContain("✗ failed");
  });

  it("nothing ran", async () => {
    const rt = makeRuntime(
      happyApi().on(
        "POST",
        SELECT,
        apiError(422, "no_scenarios_for_tag", [
          { msg: "No scenarios tagged 'x'.", loc: ["body", "tag"] },
        ]),
      ),
    );
    expect(await run(rt, "sim", "run", "--tag", "x", "--output", "json")).toBe(2);
    const doc = check(rt.out());
    expect(doc.run).toBeNull();
    expect(doc.error.code).toBe("no_scenarios_for_tag");
  });

  it("usage error", async () => {
    const rt = makeRuntime(happyApi());
    expect(await run(rt, "sim", "run", "--output", "json")).toBe(2);
    expect(check(rt.out()).reason).toBe("usage_error");
  });

  it("timeout", async () => {
    vi.useFakeTimers();
    const api = happyApi(pendingRun()).on(
      "POST",
      CANCEL,
      json(
        200,
        makeRun({
          status: "canceled",
          result: "canceled",
          reason: "canceled",
          simulation_calls: [call({ verdict: "canceled", failure_category: "canceled" })],
        }),
      ),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke", "--timeout", "10s", "--output", "json");
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await p).toBe(0);
    const doc = check(rt.out());
    expect(doc.reason).toBe("timeout");
    expect(doc.summary.canceled).toBe(1);
  });

  it("signal", async () => {
    vi.useFakeTimers();
    const api = happyApi(pendingRun()).on(
      "POST",
      CANCEL,
      json(200, pendingRun({ status: "analyzing" })),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke", "--output", "json");
    await vi.advanceTimersByTimeAsync(1_000);
    rt.emit("SIGTERM");
    expect(await p).toBe(143);
    const doc = check(rt.out());
    expect(doc.exit_code).toBe(143);
    expect(doc.summary.pending).toBe(1);
  });

  it("--no-wait", async () => {
    const rt = makeRuntime(happyApi(pendingRun()));
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--no-wait", "--output", "json")).toBe(0);
    const doc = check(rt.out());
    expect(doc.run.id).toBe(RUN);
    expect(doc.run.is_terminal).toBe(false);
  });

  it("runs get", async () => {
    const rt = makeRuntime(happyApi());
    expect(await run(rt, "runs", "get", String(RUN), "--output", "json")).toBe(0);
    check(rt.out());
  });
});
