import { describe, expect, it } from "vitest";
import { FileCredentialStore } from "../src/adapters/credential-store.js";
import { resolveApiKey } from "../src/config.js";
import { FakeApi, makeRuntime } from "./helpers.js";

describe("config", () => {
  it("resolves the API key from flag, then env, then the stored file", async () => {
    const rt = makeRuntime(new FakeApi(), { env: { TUNER_API_KEY: "tr_api_env" } });
    await new FileCredentialStore(rt.configDir).write("tr_api_stored");
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
});
