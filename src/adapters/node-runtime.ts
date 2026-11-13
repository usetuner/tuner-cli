import { homedir } from "node:os";
import { join } from "node:path";
import type { Runtime } from "../ports.js";

/** Resolves early (never rejects) when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, Math.max(0, ms));
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function defaultConfigDir(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string {
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "tuner");
  if (platform === "darwin") return join(home, "Library", "Application Support", "tuner");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "tuner");
}

/** The real runtime, built from the process `cli/main.ts` hands in. */
export function nodeRuntime(proc: NodeJS.Process): Runtime {
  return {
    env: proc.env,
    stdout: proc.stdout,
    stderr: proc.stderr,
    stdinIsTTY: Boolean(proc.stdin.isTTY),
    fetch: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    sleep,
    configDir: defaultConfigDir(proc.platform, proc.env, homedir()),
    onSignal(handler) {
      const onInt = () => handler("SIGINT");
      const onTerm = () => handler("SIGTERM");
      proc.on("SIGINT", onInt);
      proc.on("SIGTERM", onTerm);
      return () => {
        proc.off("SIGINT", onInt);
        proc.off("SIGTERM", onTerm);
      };
    },
    exit: (code) => proc.exit(code),
    async readStdin() {
      const chunks: Buffer[] = [];
      for await (const chunk of proc.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    },
    promptSecret: (prompt) => promptSecret(proc, prompt),
  };
}

function promptSecret(proc: NodeJS.Process, prompt: string): Promise<string> {
  const stdin = proc.stdin;
  proc.stderr.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      proc.stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          finish();
          return resolve(value);
        }
        if (ch === "\u0003") {
          finish();
          proc.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
