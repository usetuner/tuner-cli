import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { defaultConfigDir, nodeRuntime, sleep } from "../../src/adapters/node-runtime.js";

describe("defaultConfigDir", () => {
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

describe("sleep", () => {
  it("resolves at once when already aborted, and early on abort", async () => {
    const done = new AbortController();
    done.abort();
    await sleep(60_000, done.signal);
    const later = new AbortController();
    const p = sleep(60_000, later.signal);
    later.abort();
    await p;
  });
});

describe("nodeRuntime", () => {
  it("reads the process it is given, not the global one", () => {
    const proc = Object.assign(new EventEmitter(), {
      env: { TUNER_API_KEY: "k", XDG_CONFIG_HOME: "/xdg" },
      stdout: { write: () => true },
      stderr: { write: () => true },
      stdin: { isTTY: true },
      platform: "linux",
      exit: (code: number) => {
        throw new Error(`exit ${code}`);
      },
    }) as unknown as NodeJS.Process;
    const rt = nodeRuntime(proc);
    expect(rt.env.TUNER_API_KEY).toBe("k");
    expect(rt.configDir).toBe("/xdg/tuner");
    expect(rt.stdinIsTTY).toBe(true);
    expect(() => rt.exit(3)).toThrow("exit 3");
    const seen: string[] = [];
    const off = rt.onSignal((s) => seen.push(s));
    proc.emit("SIGINT");
    proc.emit("SIGTERM");
    off();
    proc.emit("SIGINT");
    expect(seen).toEqual(["SIGINT", "SIGTERM"]);
  });
});
