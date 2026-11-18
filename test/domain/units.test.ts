import { describe, expect, it } from "vitest";
import { parseDuration } from "../../src/domain/duration.js";
import { detailText } from "../../src/domain/errors.js";
import { EXIT, exitForError, exitForRun, exitForSignal, worstExit } from "../../src/domain/exit.js";

describe("exitForRun", () => {
  it.each([
    ["passed", null, 0],
    ["failed", "agent_failed", 1],
    ["failed", null, 1],
    ["pending", "agent_failed", 1],
    ["inconclusive", "tuner_error", 3],
    ["canceled", "canceled", 3],
    ["inconclusive", null, 3],
    [null, null, 3],
    [null, "tuner_error", 3],
    [null, "timeout", 124],
    ["canceled", "timeout", 124],
    ["passed", "timeout", 124],
    ["failed", "timeout", 1],
    ["failed", "tuner_error", 1],
    ["pending", "tuner_error", 3],
  ] as const)("%s/%s -> %d", (result, reason, code) => {
    expect(exitForRun(result, reason)).toBe(code);
  });

  it("picks the worst outcome: 1 over 3 over 124 over 0", () => {
    expect(worstExit([EXIT.TIMEOUT, EXIT.TUNER_FAULT, EXIT.AGENT_FAILED])).toBe(1);
    expect(worstExit([EXIT.TIMEOUT, EXIT.TUNER_FAULT])).toBe(3);
    expect(worstExit([EXIT.OK, EXIT.TIMEOUT])).toBe(124);
    expect(worstExit([EXIT.OK])).toBe(0);
    expect(worstExit([])).toBe(0);
  });

  it("maps signals", () => {
    expect(exitForSignal("SIGINT")).toBe(EXIT.SIGINT);
    expect(exitForSignal("SIGTERM")).toBe(EXIT.SIGTERM);
  });
});

describe("exitForError", () => {
  it.each([
    ["invalid_api_key", 401, 4],
    ["invalid_api_key", 403, 4],
    ["insufficient_access", 403, 4],
    ["validation_error", 403, 4],
    ["validation_error", 401, 4],
    ["no_scenarios_for_tag", 422, 5],
    ["agent_not_found", 404, 5],
    ["scenario_not_found", 404, 5],
    ["internal_error", 500, 3],
    ["run_start_failed", 503, 3],
    ["validation_error", 502, 3],
    ["tuner_error", undefined, 3],
    ["validation_error", 422, 2],
    ["unresolved_name", 422, 2],
    ["run_too_large", 422, 2],
    ["insufficient_credits", 402, 2],
    ["run_in_flight", 409, 2],
    ["simulation_not_configured", 422, 2],
    ["workspace_not_found", 404, 5],
    ["run_not_found", 404, 2],
    ["rate_limited", 429, 2],
    ["usage_error", undefined, 2],
    ["config_error", undefined, 2],
  ] as const)("%s (%s) -> %d", (code, status, exit) => {
    expect(exitForError(code, status)).toBe(exit);
  });
});

describe("parseDuration", () => {
  it.each([
    ["90s", 90_000],
    ["30m", 1_800_000],
    ["1h", 3_600_000],
    ["1h30m", 5_400_000],
    ["45", 45_000],
  ])("%s", (input, ms) => expect(parseDuration(input)).toBe(ms));

  it.each(["", "0", "0m", "abc", "10x", "-5m"])("rejects '%s'", (input) => {
    expect(() => parseDuration(input)).toThrow();
  });
});

describe("detailText", () => {
  it("reads every detail shape", () => {
    expect(detailText("Invalid API key.")).toBe("Invalid API key.");
    expect(detailText([{ msg: "a" }, { msg: "b" }])).toBe("a; b");
    expect(detailText({ code: "x", message: "No credits" })).toBe("No credits");
    expect(detailText(null)).toBe("");
  });
});
