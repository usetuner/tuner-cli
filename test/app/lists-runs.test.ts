import { describe, expect, it } from "vitest";
import {
  listAgents,
  listLanguages,
  listNoise,
  listProfiles,
  listSuites,
  listScenarios,
} from "../../src/app/lists.js";
import { cancelRun, getRun } from "../../src/app/runs.js";
import { NetworkError } from "../../src/domain/errors.js";
import { fakeDeps } from "../fakes/deps.js";
import { makeRun, whoami } from "../helpers.js";

describe("list use cases", () => {
  it("lists with the workspace and agent IDs, defaulting missing arrays", async () => {
    const f = fakeDeps({
      whoami: async () => whoami(),
      listAgents: async () => [],
      listScenarios: async () => ({}) as never,
      listCallerPersonas: async () => ({ personas: [{ code: "en-US", name: "English" }] }) as never,
      listNoiseEnvironments: async () => ({ environments: [] }) as never,
      listProfiles: async () => ({}) as never,
      listSuites: async () => ({}) as never,
    });
    expect(await listAgents(f.deps, {})).toEqual([]);
    expect(await listScenarios(f.deps, {}, "booking-staging", "smoke")).toEqual([]);
    expect(await listLanguages(f.deps, {})).toHaveLength(1);
    expect(await listNoise(f.deps, {})).toEqual([]);
    expect(await listProfiles(f.deps, {}, "booking-staging")).toEqual([]);
    expect(f.api.called("listScenarios")).toEqual([[12, 77, "smoke"]]);
    expect(await listSuites(f.deps, {}, "booking-staging")).toEqual([]);
    expect(f.api.called("listProfiles")).toEqual([[12, 77]]);
    expect(f.api.called("listSuites")).toEqual([[12, 77]]);
  });
});

describe("run use cases", () => {
  it("gets a run, retrying a network error", async () => {
    let calls = 0;
    const f = fakeDeps({
      whoami: async () => whoami(),
      getRun: async () => {
        if (calls++ === 0) throw new NetworkError("down");
        return makeRun();
      },
    });
    const { run, target } = await getRun(f.deps, { flags: {}, agent: "a", runId: 4821 });
    expect(run.id).toBe(4821);
    expect(target.agent?.id).toBe(77);
    expect(f.api.called("getRun")[1]).toEqual([12, 77, 4821]);
  });

  it("retries the idempotent cancel, then gives up", async () => {
    const f = fakeDeps({
      whoami: async () => whoami(),
      cancelRun: async () => {
        throw new NetworkError("down");
      },
    });
    await expect(cancelRun(f.deps, { flags: {}, agent: "a", runId: 1 })).rejects.toThrow("down");
    expect(f.api.called("cancelRun").length).toBeGreaterThan(1);
  });
});
