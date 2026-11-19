import { describe, expect, it } from "vitest";
import { login, logout, status } from "../../src/app/auth.js";
import { ApiError } from "../../src/domain/errors.js";
import { fakeDeps } from "../fakes/deps.js";
import { whoami } from "../helpers.js";

describe("auth use cases", () => {
  it("logs in with the flag key and stores it", async () => {
    const f = fakeDeps({ whoami: async () => whoami(null) });
    let read = false;
    const out = await login(f.deps, { apiKey: " tr_api_new " }, async () => {
      read = true;
      return "";
    });
    expect(read).toBe(false);
    expect(out.path).toBe(f.credentials.path);
    expect(f.credentials.key).toBe("tr_api_new");
    expect(f.connected[0]).toEqual(["https://api.usetuner.ai", "tr_api_new"]);
  });

  it("reads the key when no flag is given, and rejects an empty one", async () => {
    const f = fakeDeps({ whoami: async () => whoami(null) });
    await login(f.deps, {}, async () => "tr_api_read\n");
    expect(f.credentials.key).toBe("tr_api_read");
    await expect(login(f.deps, {}, async () => "  ")).rejects.toThrow("No API key given.");
  });

  it("does not store a rejected key", async () => {
    const f = fakeDeps({
      whoami: async () => {
        throw new ApiError(401, "invalid_api_key", "Invalid API key.", {}, undefined);
      },
    });
    await expect(login(f.deps, { apiKey: "bad" }, async () => "")).rejects.toThrow(
      "API key rejected (Invalid API key); key from --api-key.",
    );
    expect(f.credentials.key).toBeUndefined();
  });

  it("logs out and reports a key still in the environment", async () => {
    const f = fakeDeps();
    f.credentials.key = "x";
    expect(await logout(f.deps)).toEqual({
      removed: true,
      path: f.credentials.path,
      envKeySet: true,
    });
    expect((await logout(f.deps)).removed).toBe(false);
  });

  it("reports status without the key", async () => {
    const f = fakeDeps({ whoami: async () => whoami(null) });
    const s = await status(f.deps, { baseUrl: "http://127.0.0.1:1/" });
    expect(s.keySource).toBe("TUNER_API_KEY");
    expect(s.baseUrl).toBe("http://127.0.0.1:1");
    expect(JSON.stringify(s)).not.toContain("tr_api_test");
  });
});
