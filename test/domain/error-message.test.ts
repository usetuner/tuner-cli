import { describe, expect, it } from "vitest";
import { toCliError } from "../../src/domain/error-message.js";
import { ApiError, CliError, GaveUpError, NetworkError } from "../../src/domain/errors.js";

const api = (code: string, detail: unknown, body: Record<string, unknown> = {}) =>
  new ApiError(400, code, detail, body, undefined);

describe("toCliError", () => {
  it("passes a CliError through", () => {
    const err = new CliError("x", "usage_error");
    expect(toCliError(err)).toBe(err);
  });

  it("marks give-up and unknown errors as tuner_error", () => {
    expect(toCliError(new GaveUpError(new NetworkError("down")))).toMatchObject({
      reason: "tuner_error",
      message: "Tuner is unavailable: down",
    });
    expect(toCliError(new Error("boom")).reason).toBe("tuner_error");
    expect(toCliError("raw").message).toBe("raw");
  });

  it("names the key source on a rejected key", () => {
    expect(toCliError(api("invalid_api_key", "Bad"), { keySource: "TUNER_API_KEY" }).message).toBe(
      "API key rejected: Bad (key from TUNER_API_KEY)",
    );
    expect(toCliError(api("invalid_api_key", "Bad")).message).toBe("API key rejected: Bad");
  });

  it("names the agent, tag and list command", () => {
    expect(toCliError(api("agent_not_found", "nf"), { agentRef: "a1" }).message).toBe(
      "Agent 'a1' not found in this workspace.",
    );
    expect(toCliError(api("agent_not_found", "nf")).message).toBe("nf");
    expect(toCliError(api("no_scenarios_for_tag", "d"), { tag: "t" }).message).toBe(
      "No scenarios tagged 't'. Run `tuner scenarios list` to see tags.",
    );
    expect(toCliError(api("no_scenarios_for_tag", "d")).message).toBe(
      "d Run `tuner scenarios list` to see tags.",
    );
    expect(toCliError(api("scenario_not_found", "Scenario 9 not found")).message).toBe(
      "Scenario 9 not found. Run `tuner scenarios list` to see scenario IDs.",
    );
  });

  it("adds the field of an unresolved name", () => {
    const err = toCliError(
      api("unresolved_name", [
        { loc: ["body", "profile"], msg: "Unknown profile 'x'", input: "x" },
      ]),
    );
    expect(err.message).toBe("Unknown profile 'x' Run `tuner profiles list`.");
    expect(err.extra).toEqual({ field: "profile", value: "x" });
    expect(toCliError(api("unresolved_name", "plain")).extra).toEqual({
      field: undefined,
      value: undefined,
    });
  });

  it("points at the run already in flight", () => {
    const err = toCliError(api("run_in_flight", "busy", { run_id: 7, dashboard_url: "u" }));
    expect(err.message).toBe(
      "The agent already has a run in progress (run 7). u\nCheck it with `tuner runs get 7`.",
    );
    expect(toCliError(api("run_in_flight", "busy")).message).toBe(
      "The agent already has a run in progress.",
    );
  });

  it("maps the remaining codes", () => {
    expect(toCliError(api("insufficient_access", "no")).message).toContain("can't access");
    expect(toCliError(api("insufficient_credits", "none")).message).toContain("No credits");
    expect(toCliError(api("simulation_not_configured", "x")).message).toContain("isn't set up");
    expect(toCliError(api("validation_error", "")).message).toBe("400 validation_error: ");
  });
});
