import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_URL,
  credentialsPath,
  readStoredKey,
  resolveAgentRef,
  resolveApiKey,
  resolveBaseUrl,
  writeStoredKey,
} from "../src/config.js";
import { CliError } from "../src/errors.js";
import { defaultConfigDir } from "../src/runtime.js";
import { FakeApi, makeRuntime } from "./helpers.js";

describe("config", () => {
  it("resolves the API key from flag, then env, then the stored file", async () => {
    const rt = makeRuntime(new FakeApi(), { env: { TUNER_API_KEY: "tr_api_env" } });
    await writeStoredKey(rt, "tr_api_stored");
    expect(await resolveApiKey({ apiKey: "tr_api_flag" }, rt)).toEqual({
      key: "tr_api_flag",
      source: "flag",
    });
    expect(await resolveApiKey({}, rt)).toEqual({ key: "tr_api_env", source: "env" });
    rt.env.TUNER_API_KEY = undefined;
    expect(await resolveApiKey({}, rt)).toEqual({ key: "tr_api_stored", source: "stored" });
  });

  it("returns undefined when no key is anywhere", async () => {
    const rt = makeRuntime(new FakeApi(), { env: { TUNER_API_KEY: undefined } });
    expect(await resolveApiKey({}, rt)).toBeUndefined();
  });

  it("writes the credentials file with 0600", async () => {
    const rt = makeRuntime(new FakeApi());
    const path = await writeStoredKey(rt, "tr_api_x");
    expect(path).toBe(credentialsPath(rt));
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(await readStoredKey(rt)).toBe("tr_api_x");
  });

  it("resolves the base URL from flag, env, then production", () => {
    const rt = makeRuntime(new FakeApi(), {
      env: { TUNER_BASE_URL: "https://staging.example.com/" },
    });
    expect(resolveBaseUrl({ baseUrl: "http://127.0.0.1:8010" }, rt)).toBe("http://127.0.0.1:8010");
    expect(resolveBaseUrl({}, rt)).toBe("https://staging.example.com");
    rt.env.TUNER_BASE_URL = undefined;
    expect(resolveBaseUrl({}, rt)).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe("https://api.usetuner.ai");
  });

  it("rejects a non-http base URL", () => {
    const rt = makeRuntime(new FakeApi());
    expect(() => resolveBaseUrl({ baseUrl: "ftp://x" }, rt)).toThrow(CliError);
    expect(() => resolveBaseUrl({ baseUrl: "not a url" }, rt)).toThrow(CliError);
  });

  it("resolves the agent from flag, then TUNER_AGENT_ID", () => {
    const rt = makeRuntime(new FakeApi(), { env: { TUNER_AGENT_ID: "env-agent" } });
    expect(resolveAgentRef("flag-agent", rt)).toBe("flag-agent");
    expect(resolveAgentRef(undefined, rt)).toBe("env-agent");
    rt.env.TUNER_AGENT_ID = "";
    expect(resolveAgentRef(undefined, rt)).toBeUndefined();
  });

  it("uses the OS config dir", () => {
    expect(defaultConfigDir("linux", {}, "/home/u")).toBe("/home/u/.config/tuner");
    expect(defaultConfigDir("linux", { XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe("/xdg/tuner");
    expect(defaultConfigDir("darwin", {}, "/Users/u")).toBe(
      "/Users/u/Library/Application Support/tuner",
    );
    expect(defaultConfigDir("win32", { APPDATA: "C:\\AppData" }, "C:\\Users\\u")).toContain(
      "tuner",
    );
  });
});
