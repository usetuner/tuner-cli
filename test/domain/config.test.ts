import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, resolveAgentRef, resolveBaseUrl } from "../../src/domain/config.js";
import { CliError } from "../../src/domain/errors.js";

describe("config", () => {
  it("resolves the base URL from flag, env, then production", () => {
    const env: Record<string, string | undefined> = {
      TUNER_BASE_URL: "https://staging.example.com/",
    };
    expect(resolveBaseUrl({ baseUrl: "http://127.0.0.1:8010" }, { env })).toBe(
      "http://127.0.0.1:8010",
    );
    expect(resolveBaseUrl({}, { env })).toBe("https://staging.example.com");
    expect(resolveBaseUrl({}, { env: {} })).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe("https://api.usetuner.ai");
  });

  it("rejects a non-http base URL", () => {
    expect(() => resolveBaseUrl({ baseUrl: "ftp://x" }, { env: {} })).toThrow(CliError);
    expect(() => resolveBaseUrl({ baseUrl: "not a url" }, { env: {} })).toThrow(CliError);
  });

  it("resolves the agent from flag, then TUNER_AGENT_ID", () => {
    const env = { TUNER_AGENT_ID: "env-agent" };
    expect(resolveAgentRef("flag-agent", { env })).toBe("flag-agent");
    expect(resolveAgentRef(undefined, { env })).toBe("env-agent");
    expect(resolveAgentRef(undefined, { env: { TUNER_AGENT_ID: "" } })).toBeUndefined();
  });
});
