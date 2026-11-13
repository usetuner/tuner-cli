import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/adapters/version.js";
import { DEFAULT_BASE_URL } from "../../src/domain/config.js";
import { FakeApi, happyApi, json, makeRuntime, run, whoami } from "../helpers.js";

describe("program", () => {
  it("--version prints the package version", async () => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "--version")).toBe(0);
    expect(rt.out().trim()).toBe(VERSION);
  });

  it("--help lists every command", async () => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "--help")).toBe(0);
    for (const c of [
      "sim",
      "runs",
      "scenarios",
      "languages",
      "noise",
      "profiles",
      "agents",
      "auth",
    ]) {
      expect(rt.out()).toContain(c);
    }
  });

  it("runs --help shows get and cancel", async () => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "runs", "--help")).toBe(0);
    expect(rt.out()).toContain("get");
    expect(rt.out()).toContain("cancel");
  });

  it("unknown commands and options exit 2", async () => {
    expect(await run(makeRuntime(new FakeApi()), "bogus")).toBe(2);
    expect(await run(makeRuntime(new FakeApi()), "sim", "run", "--bogus")).toBe(2);
  });

  it("global flags work after the subcommand", async () => {
    const api = happyApi();
    const rt = makeRuntime(api, { env: { TUNER_BASE_URL: undefined, TUNER_API_KEY: undefined } });
    expect(
      await run(
        rt,
        "sim",
        "run",
        "--tag",
        "x",
        "--api-key",
        "tr_api_flag",
        "--base-url",
        "http://127.0.0.1:8010",
      ),
    ).toBe(0);
    expect(api.requests[0]!.headers.authorization).toBe("Bearer tr_api_flag");
    expect(api.requests[0]!.url.origin).toBe("http://127.0.0.1:8010");
  });

  it("defaults to the production base URL", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, whoami()));
    const rt = makeRuntime(api, { env: { TUNER_BASE_URL: undefined } });
    await run(rt, "auth", "status");
    expect(api.requests[0]!.url.origin).toBe(DEFAULT_BASE_URL);
  });
});
