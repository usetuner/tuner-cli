import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../src/app/target.js";
import { ApiError, CliError, NetworkError } from "../../src/domain/errors.js";
import { fakeDeps } from "../fakes/deps.js";
import { defaultAgent, whoami } from "../helpers.js";

const opts = { flags: {}, needAgent: true, giveUpMs: 30_000 };

describe("resolveTarget", () => {
  it("uses whoami's agent for a remote identifier", async () => {
    const f = fakeDeps({ whoami: async () => whoami() });
    const t = await resolveTarget(f.deps, { ...opts, agent: "booking-staging" });
    expect(t.agent).toEqual(defaultAgent);
    expect(f.api.called("whoami")).toEqual([["booking-staging"]]);
    expect(f.connected).toEqual([["https://api.usetuner.ai", "tr_api_test"]]);
  });

  it("looks a numeric agent up by ID", async () => {
    const f = fakeDeps({
      whoami: async () => whoami(null),
      getAgent: async () => ({ ...defaultAgent, extra: 1 }) as never,
    });
    const t = await resolveTarget(f.deps, { ...opts, agent: "77" });
    expect(f.api.called("whoami")).toEqual([[undefined]]);
    expect(f.api.called("getAgent")).toEqual([[12, "77"]]);
    expect(t.agent).toEqual(defaultAgent);
  });

  it("skips the agent when not needed", async () => {
    const f = fakeDeps({ whoami: async () => whoami(null) });
    const t = await resolveTarget(f.deps, { ...opts, needAgent: false, agent: "x" });
    expect(t.agent).toBeUndefined();
    expect(t.workspace).toEqual({ id: 12, name: "Acme" });
  });

  it("needs an agent, a key and a matching workspace", async () => {
    await expect(resolveTarget(fakeDeps().deps, opts)).rejects.toThrow("No agent.");
    await expect(resolveTarget(fakeDeps({}, {}).deps, opts)).rejects.toThrow("No API key.");
    const f = fakeDeps(
      { whoami: async () => whoami() },
      {
        TUNER_API_KEY: "k",
        TUNER_WORKSPACE_ID: "99",
      },
    );
    await expect(resolveTarget(f.deps, { ...opts, agent: "a" })).rejects.toThrow(
      "TUNER_WORKSPACE_ID is 99 but the API key belongs to workspace 12 (Acme).",
    );
  });

  it("names the key source and agent in API errors", async () => {
    const f = fakeDeps({
      whoami: async () => {
        throw new ApiError(401, "invalid_api_key", "Invalid API key.", {}, undefined);
      },
    });
    await expect(resolveTarget(f.deps, { ...opts, agent: "a" })).rejects.toThrow(
      "API key rejected (Invalid API key); key from TUNER_API_KEY.",
    );
    const g = fakeDeps({
      whoami: async () => whoami(null),
      getAgent: async () => {
        throw new ApiError(404, "agent_not_found", "nf", {}, undefined);
      },
    });
    await expect(resolveTarget(g.deps, { ...opts, agent: "5" })).rejects.toThrow(
      "Agent '5' not found in this workspace.",
    );
  });

  it("retries a network error on the fake clock", async () => {
    let calls = 0;
    const f = fakeDeps({
      whoami: async () => {
        if (calls++ === 0) throw new NetworkError("down");
        return whoami();
      },
    });
    await resolveTarget(f.deps, { ...opts, agent: "a" });
    expect(f.clock.sleeps).toEqual([3_000]);
  });

  it("stops as canceled when aborted", async () => {
    const ac = new AbortController();
    const f = fakeDeps({
      whoami: async () => {
        ac.abort();
        throw new NetworkError("down");
      },
    });
    const err = await resolveTarget(f.deps, { ...opts, agent: "a", signal: ac.signal }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).reason).toBe("canceled");
  });
});
