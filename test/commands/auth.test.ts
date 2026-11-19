import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileCredentialStore } from "../../src/adapters/credential-store.js";
import { FakeApi, apiError, json, makeRuntime, run, whoami } from "../helpers.js";

afterEach(() => vi.useRealTimers());

const ok = () => new FakeApi().on("GET", "/api/v1/whoami", json(200, whoami(null)));

describe("auth login", () => {
  it("validates with whoami, then saves the key with 0600", async () => {
    const api = ok();
    const rt = makeRuntime(api, { env: { TUNER_API_KEY: undefined } });
    expect(await run(rt, "auth", "login", "--api-key", "tr_api_new")).toBe(0);
    expect(api.requests[0]!.headers.authorization).toBe("Bearer tr_api_new");
    const path = new FileCredentialStore(rt.configDir).path;
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ api_key: "tr_api_new" });
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(rt.out()).toContain("Logged in to workspace Acme (12) with key ci-staging (…9f3a)");
  });

  it("retries a 429 or 5xx like the other commands, then saves the key", async () => {
    vi.useFakeTimers();
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      apiError(429, "rate_limited", "slow", {}, { "retry-after": "1" }),
      apiError(502, "internal_error", "Bad gateway"),
      json(200, whoami(null)),
    );
    const rt = makeRuntime(api, { env: { TUNER_API_KEY: undefined } });
    const p = run(rt, "auth", "login", "--api-key", "tr_api_new");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe(0);
    expect(api.requests).toHaveLength(3);
  });

  it("exits 3 when Tuner keeps rate limiting, like every other command", async () => {
    vi.useFakeTimers();
    const api = new FakeApi().on("GET", "/api/v1/whoami", apiError(429, "rate_limited", "slow"));
    const rt = makeRuntime(api, { env: { TUNER_API_KEY: undefined } });
    const p = run(rt, "auth", "login", "--api-key", "tr_api_new");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await p).toBe(3);
    expect(rt.err()).toContain("Tuner kept rate limiting requests (429 rate_limited)");
  });

  it("does not save a rejected key", async () => {
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      apiError(403, "invalid_api_key", "Invalid API key."),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "auth", "login", "--api-key", "tr_api_bad")).toBe(2);
    expect(existsSync(new FileCredentialStore(rt.configDir).path)).toBe(false);
    expect(rt.err()).toContain("API key rejected (Invalid API key); key from --api-key.");
  });

  it("reads the key from stdin when not a TTY", async () => {
    const rt = makeRuntime(ok(), { stdin: "tr_api_piped\n" });
    expect(await run(rt, "auth", "login")).toBe(0);
    expect(readFileSync(new FileCredentialStore(rt.configDir).path, "utf8")).toContain(
      "tr_api_piped",
    );
  });

  it("prompts in a TTY", async () => {
    const rt = makeRuntime(ok(), { stdinIsTTY: true, secret: "tr_api_typed" });
    expect(await run(rt, "auth", "login")).toBe(0);
    expect(readFileSync(new FileCredentialStore(rt.configDir).path, "utf8")).toContain(
      "tr_api_typed",
    );
  });

  it("exits 2 on an empty key", async () => {
    const rt = makeRuntime(ok(), { stdin: "" });
    expect(await run(rt, "auth", "login")).toBe(2);
  });
});

describe("auth status", () => {
  it("shows the key, its source and workspace", async () => {
    const rt = makeRuntime(ok());
    expect(await run(rt, "auth", "status")).toBe(0);
    expect(rt.out()).toContain("ci-staging (…9f3a) from TUNER_API_KEY");
    expect(rt.out()).toContain("Workspace: Acme (12)");
    expect(rt.out()).toContain("Base URL:  http://127.0.0.1:8010");
  });

  it("reports a stored key's path", async () => {
    const rt = makeRuntime(ok(), { env: { TUNER_API_KEY: undefined } });
    await new FileCredentialStore(rt.configDir).write("tr_api_s");
    expect(await run(rt, "auth", "status")).toBe(0);
    expect(rt.out()).toContain(`from ${new FileCredentialStore(rt.configDir).path}`);
  });

  it("exits 2 with no key", async () => {
    const rt = makeRuntime(ok(), { env: { TUNER_API_KEY: undefined } });
    expect(await run(rt, "auth", "status")).toBe(2);
  });

  it("exits 2 with a rejected key and names its source", async () => {
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      apiError(403, "invalid_api_key", "Invalid API key."),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "--api-key", "tr_api_x", "auth", "status")).toBe(2);
    expect(rt.err()).toContain("; key from --api-key.");
  });
});

describe("stored key problems", () => {
  it("names a broken credentials file and exits 2", async () => {
    const rt = makeRuntime(ok(), { env: { TUNER_API_KEY: undefined } });
    const path = new FileCredentialStore(rt.configDir).path;
    mkdirSync(rt.configDir, { recursive: true });
    writeFileSync(path, "{broken");
    expect(await run(rt, "auth", "status")).toBe(2);
    expect(rt.err()).toContain(`Can't read the stored API key at ${path} (not valid JSON).`);
  });

  it("says there is no key when nothing is stored", async () => {
    const rt = makeRuntime(ok(), { env: { TUNER_API_KEY: undefined } });
    expect(await run(rt, "auth", "status")).toBe(2);
    expect(rt.err()).toContain("No API key. Set TUNER_API_KEY or run `tuner auth login`.");
  });
});

describe("auth logout", () => {
  it("deletes the stored key", async () => {
    const rt = makeRuntime(ok(), { env: { TUNER_API_KEY: undefined } });
    await new FileCredentialStore(rt.configDir).write("tr_api_s");
    expect(await run(rt, "auth", "logout")).toBe(0);
    expect(existsSync(new FileCredentialStore(rt.configDir).path)).toBe(false);
    expect(await run(rt, "auth", "logout")).toBe(0);
    expect(rt.out()).toContain("No stored API key.");
  });
});
