import { describe, expect, it } from "vitest";
import { CliError } from "../../src/domain/errors.js";
import {
  buildStartBody,
  parseRunId,
  parseScenarioIds,
  parseTimeout,
} from "../../src/domain/inputs.js";

describe("parseRunId", () => {
  it("accepts a positive integer", () => expect(parseRunId("42")).toBe(42));
  it.each(["0", "abc", "-1", "1.5"])("rejects '%s'", (value) => {
    expect(() => parseRunId(value)).toThrow(CliError);
  });
});

describe("parseScenarioIds", () => {
  it("splits repeats and commas", () => {
    expect(parseScenarioIds(["1,2", " 3 ", ""])).toEqual([1, 2, 3]);
  });
  it("rejects a non-numeric ID", () => {
    expect(() => parseScenarioIds(["1,x"])).toThrow("Invalid scenario ID 'x'");
  });
});

describe("parseTimeout", () => {
  it("parses a duration", () => expect(parseTimeout("2m")).toBe(120_000));
  it("turns a bad duration into a usage error", () => {
    const err = (() => {
      try {
        parseTimeout("soon");
      } catch (e) {
        return e as CliError;
      }
    })();
    expect(err).toBeInstanceOf(CliError);
    expect(err?.reason).toBe("usage_error");
  });
});

describe("buildStartBody", () => {
  it("builds a tag run with options", () => {
    expect(buildStartBody({ tag: "t", language: "en-US", profile: "p", noise: "cafe" })).toEqual({
      tag: "t",
      language: "en-US",
      profile: "p",
      noise: "cafe",
    });
  });
  it("builds a scenario run", () => {
    expect(buildStartBody({ scenario: ["1", "2"] })).toEqual({ selected_scenario_ids: [1, 2] });
  });
  it.each([{}, { tag: "t", scenario: ["1"] }])("needs exactly one selector: %j", (opts) => {
    expect(() => buildStartBody(opts)).toThrow("Pass exactly one of --tag or --scenario.");
  });
});
