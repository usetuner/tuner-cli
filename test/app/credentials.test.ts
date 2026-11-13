import { describe, expect, it } from "vitest";
import { describeKeySource, requireApiKey, resolveApiKey } from "../../src/app/credentials.js";
import { CliError } from "../../src/domain/errors.js";
import { FakeCredentialStore } from "../fakes/credential-store.js";

describe("credentials", () => {
  it("resolves the API key from flag, then env, then the stored file", async () => {
    const credentials = new FakeCredentialStore("tr_api_stored");
    const env: Record<string, string | undefined> = { TUNER_API_KEY: "tr_api_env" };
    expect(await resolveApiKey({ apiKey: "tr_api_flag" }, { env, credentials })).toEqual({
      key: "tr_api_flag",
      source: "flag",
    });
    expect(await resolveApiKey({}, { env, credentials })).toEqual({
      key: "tr_api_env",
      source: "env",
    });
    env.TUNER_API_KEY = " ";
    expect(await resolveApiKey({}, { env, credentials })).toEqual({
      key: "tr_api_stored",
      source: "stored",
    });
  });

  it("returns undefined when no key is anywhere, and requireApiKey says how to fix it", async () => {
    const deps = { env: {}, credentials: new FakeCredentialStore() };
    expect(await resolveApiKey({}, deps)).toBeUndefined();
    await expect(requireApiKey({}, deps)).rejects.toThrow(CliError);
    await expect(requireApiKey({}, deps)).rejects.toThrow("tuner auth login");
  });

  it("names where the key came from without printing it", () => {
    const deps = { credentials: new FakeCredentialStore("secret") };
    expect(describeKeySource("flag", deps)).toBe("--api-key");
    expect(describeKeySource("env", deps)).toBe("TUNER_API_KEY");
    expect(describeKeySource("stored", deps)).toBe("/fake/tuner/credentials.json");
  });
});
