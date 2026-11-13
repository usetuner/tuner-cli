import { describe, expect, it } from "vitest";
import { CliError } from "../../src/domain/errors.js";
import {
  buildStartBody,
  parseNoiseIntensity,
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
  it("sends a noise intensity name as a string and a gain as a number", () => {
    expect(buildStartBody({ tag: "t", noise: "office", noiseIntensity: "high" })).toEqual({
      tag: "t",
      noise: "office",
      noise_intensity: "high",
    });
    expect(buildStartBody({ tag: "t", noise: "office", noiseIntensity: "0.5" })).toEqual({
      tag: "t",
      noise: "office",
      noise_intensity: 0.5,
    });
  });
  it("needs --noise for --noise-intensity", () => {
    expect(() => buildStartBody({ tag: "t", noiseIntensity: "high" })).toThrow(
      "--noise-intensity needs --noise <slug>.",
    );
  });
  it("builds a scenario run", () => {
    expect(buildStartBody({ scenario: ["1", "2"] })).toEqual({ selected_scenario_ids: [1, 2] });
  });
  it.each([{}, { tag: "t", scenario: ["1"] }])("needs exactly one selector: %j", (opts) => {
    expect(() => buildStartBody(opts)).toThrow("Pass exactly one of --tag or --scenario.");
  });
});

describe("parseNoiseIntensity", () => {
  it.each([
    ["high", "high"],
    ["Medium", "Medium"],
    ["loud", "loud"],
    ["0.5", 0.5],
    ["1.0", 1],
    ["1.", 1],
    [".5", 0.5],
    ["2", 2],
    ["-1", "-1"],
    ["1e3", "1e3"],
  ])("%s -> %j, unvalidated", (value, expected) => {
    expect(parseNoiseIntensity(value)).toBe(expected);
  });
});
