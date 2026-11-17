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

  it("sim run --help shows its own flags, not the root commands", async () => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "sim", "run", "--help")).toBe(0);
    for (const flag of ["--tag", "--scenario", "--no-wait", "--timeout"]) {
      expect(rt.out()).toContain(flag);
    }
    expect(rt.out()).not.toContain("Commands:");
    expect(rt.err()).toBe("");
  });

  const leaves: [string[], string][] = [
    [["sim", "run"], "Usage: tuner sim run [options]"],
    [["runs", "get"], "Usage: tuner runs get [options] <run-id>"],
    [["runs", "cancel"], "Usage: tuner runs cancel [options] <run-id>"],
    [["scenarios", "list"], "Usage: tuner scenarios list [options]"],
    [["languages", "list"], "Usage: tuner languages list [options]"],
    [["noise", "list"], "Usage: tuner noise list [options]"],
    [["profiles", "list"], "Usage: tuner profiles list [options]"],
    [["agents", "list"], "Usage: tuner agents list [options]"],
    [["auth", "login"], "Usage: tuner auth login [options]"],
    [["auth", "logout"], "Usage: tuner auth logout [options]"],
    [["auth", "status"], "Usage: tuner auth status [options]"],
  ];

  it.each(leaves)("%j --help prints its own usage", async (path, usage) => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, ...path, "--help")).toBe(0);
    expect(rt.out().startsWith(usage)).toBe(true);
  });

  it.each(leaves)("help %j prints its own usage", async (path, usage) => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "help", ...path)).toBe(0);
    expect(rt.out().startsWith(usage)).toBe(true);
    expect(rt.err()).toBe("");
  });

  it.each([
    ["--api-key", "tr_api_secret"],
    ["--verbose"],
    ["--base-url", "http://127.0.0.1:8010", "--verbose"],
  ])("global flags before help %j still show the leaf's help", async (...flags) => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, ...flags, "help", "sim", "run")).toBe(0);
    expect(rt.out().startsWith("Usage: tuner sim run [options]")).toBe(true);
    expect(rt.out() + rt.err()).not.toContain("tr_api_secret");
  });

  it("unknown options exit 2 and show the command's help after the error", async () => {
    const rt = makeRuntime(new FakeApi());
    expect(await run(rt, "sim", "run", "--bogus")).toBe(2);
    expect(rt.err()).toMatch(/error: unknown option '--bogus'[\s\S]*Usage: tuner sim run/);
    expect(rt.out()).toBe("");
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
