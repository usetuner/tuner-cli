import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { credentialsPath, readStoredKey, resolveApiKey, writeStoredKey } from "../src/config.js";
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
