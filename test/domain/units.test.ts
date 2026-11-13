import { describe, expect, it } from "vitest";
import { parseDuration } from "../../src/domain/duration.js";
import { detailText } from "../../src/domain/errors.js";
import { EXIT, exitForRun, exitForSignal } from "../../src/domain/exit.js";

describe("exitForRun", () => {
  it.each([
    ["passed", null, false, 0],
    ["passed", null, true, 0],
    ["failed", "agent_failed", false, 1],
    ["failed", "agent_failed", true, 1],
    ["inconclusive", "tuner_error", false, 0],
    ["inconclusive", "tuner_error", true, 1],
    ["canceled", "canceled", false, 0],
    ["canceled", "canceled", true, 1],
    [null, "timeout", false, 0],
    [null, "timeout", true, 1],
    [null, "tuner_error", false, 0],
    [null, "tuner_error", true, 1],
  ] as const)("%s/%s fail-on-inconclusive=%s -> %d", (result, reason, flag, code) => {
    expect(exitForRun(result, reason, flag)).toBe(code);
  });

  it("maps signals", () => {
    expect(exitForSignal("SIGINT")).toBe(EXIT.SIGINT);
    expect(exitForSignal("SIGTERM")).toBe(EXIT.SIGTERM);
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
