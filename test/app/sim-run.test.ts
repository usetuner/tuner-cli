import { describe, expect, it } from "vitest";
import { type SimRunInput, runSimulation } from "../../src/app/sim-run.js";
import { ApiError, NetworkError } from "../../src/domain/errors.js";
import type { TunerApi } from "../../src/ports.js";
import { fakeDeps } from "../fakes/deps.js";
import { ExitCalled } from "../fakes/signals.js";
import { call, makeRun, pendingRun, whoami } from "../helpers.js";

const input = (over: Partial<SimRunInput> = {}): SimRunInput => ({
  flags: {},
  agent: "booking-staging",
  start: { tag: "smoke" },
  wait: true,
  ...over,
});

const started = async () => ({ simulation_run_id: 4821, generated_count: 2, success: true });

function api(over: Partial<TunerApi> = {}): Partial<TunerApi> {
  return { whoami: async () => whoami(), startRun: started as never, ...over };
}

describe("runSimulation", () => {
  it("waits for a passed run and exits 0", async () => {
    const f = fakeDeps(api({ getRun: async () => makeRun() }));
    const r = await runSimulation(f, input());
    expect(r).toMatchObject({ kind: "finished", reason: null, exitCode: 0, runId: 4821 });
    expect(f.api.called("startRun")).toEqual([[12, 77, { tag: "smoke" }]]);
    expect(f.output.lines).toEqual([
      "Workspace: Acme · Agent: Booking (staging) (77)",
      "Running 2 scenarios (run 4821)...",
    ]);
    expect(f.output.runs).toHaveLength(1);
    expect(f.signals.listening).toBe(0);
  });

  it("polls on the clock until the run is terminal", async () => {
    let n = 0;
    const f = fakeDeps(api({ getRun: async () => (n++ < 2 ? pendingRun() : makeRun()) }));
    await runSimulation(f, input());
    expect(f.clock.sleeps).toEqual([3_000, 3_000]);
  });

  it("exits 1 when the agent failed", async () => {
    const failed = makeRun({
      result: "failed",
      reason: "agent_failed",
      simulation_calls: [call({ verdict: "failed" })],
    });
    const f = fakeDeps(api({ getRun: async () => failed }));
    expect(await runSimulation(f, input())).toMatchObject({
      reason: "agent_failed",
      exitCode: 1,
    });
  });

  it("returns at once with --no-wait, even when Get a run fails", async () => {
    const f = fakeDeps(
      api({
        getRun: async () => {
          throw new NetworkError("down");
        },
      }),
    );
    const r = await runSimulation(f, input({ wait: false }));
    expect(r).toMatchObject({ kind: "started", run: undefined, exitCode: 0, runId: 4821 });
  });

  it("returns a usage error before any request", async () => {
    const f = fakeDeps(api());
    const r = await runSimulation(f, input({ start: {} }));
    expect(r).toMatchObject({
      kind: "error",
      reason: "usage_error",
      exitCode: 2,
      error: { code: "usage_error" },
    });
    expect(f.api.calls).toHaveLength(0);
    const t = await runSimulation(f, input({ timeout: "soon" }));
    expect(t.reason).toBe("usage_error");
  });

  it("names the tag when no scenario has it", async () => {
    const f = fakeDeps(
      api({
        startRun: async () => {
          throw new ApiError(404, "no_scenarios_for_tag", "x", {}, undefined);
        },
      }),
    );
    const r = await runSimulation(f, input());
    expect(r.error?.message).toBe(
      "No scenarios tagged 'smoke'. Run `tuner scenarios list` to see tags.",
    );
    expect(r.target?.workspace.id).toBe(12);
  });

  it("treats a start that never got through as a tuner fault", async () => {
    const f = fakeDeps(
      api({
        startRun: async () => {
          throw new NetworkError("down", false);
        },
      }),
    );
    const r = await runSimulation(f, input());
    expect(r).toMatchObject({ kind: "error", reason: "tuner_error", exitCode: 3 });
    expect(
      f.output.lines.some((l) => l.startsWith("Tuner unavailable (down); retrying in 3s")),
    ).toBe(true);
  });

  it("cancels on the first signal and exits at once on the second", async () => {
    const f = fakeDeps();
    let polls = 0;
    f.api.getRun = async () => {
      if (polls++ === 0) {
        f.signals.emit("SIGTERM");
        expect(() => f.signals.emit("SIGINT")).toThrow(ExitCalled);
      }
      return pendingRun();
    };
    Object.assign(f.api, {
      whoami: async () => whoami(),
      startRun: started,
      cancelRun: async () =>
        makeRun({ status: "canceled", result: "canceled", reason: "canceled" }),
    });
    const r = await runSimulation(f, input());
    expect(f.signals.exits).toEqual([130]);
    expect(r).toMatchObject({ kind: "finished", reason: "canceled", exitCode: 143 });
    expect(f.output.lines).toContain("Canceling run 4821...");
    expect(f.output.lines).toContain(
      "Stopped. Run 4821 may still be going; check it with `tuner runs get 4821`.",
    );
  });

  it("reports a signal before the start as canceled", async () => {
    const f = fakeDeps(api());
    f.api.whoami = async () => {
      f.signals.emit("SIGINT");
      throw new NetworkError("down");
    };
    expect(await runSimulation(f, input())).toMatchObject({
      kind: "canceled",
      reason: "canceled",
      exitCode: 130,
    });
  });

  it("says when Tuner stays unreachable while polling", async () => {
    const f = fakeDeps(
      api({
        getRun: async () => {
          throw new NetworkError("down");
        },
      }),
    );
    const r = await runSimulation(f, input());
    expect(r).toMatchObject({ kind: "finished", reason: "tuner_error", exitCode: 3 });
    expect(f.output.lines.at(-1)).toBe(
      "Tuner unreachable for 5 minutes (down). Run 4821 may still be going; check it with `tuner runs get 4821`.",
    );
  });

  it("says when a poll fails for good", async () => {
    const f = fakeDeps(
      api({
        getRun: async () => {
          throw new ApiError(404, "run_not_found", "gone", {}, undefined);
        },
      }),
    );
    const r = await runSimulation(f, input());
    expect(r).toMatchObject({ kind: "finished", reason: "run_not_found", exitCode: 2 });
    expect(f.output.lines.at(-1)).toContain(
      "Could not read run 4821: Run 4821 not found for this agent.",
    );
  });
});
