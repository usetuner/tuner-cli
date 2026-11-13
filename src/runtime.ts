import { homedir } from "node:os";
import { join } from "node:path";
import type { Signal } from "./domain/exit.js";

export interface Stream {
  write(text: string): void;
  isTTY?: boolean;
}

/** Everything the CLI touches outside itself, so tests can replace it. */
export interface Runtime {
  env: Record<string, string | undefined>;
  stdout: Stream;
  stderr: Stream;
  stdinIsTTY: boolean;
  fetch: typeof fetch;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  configDir: string;
  onSignal(handler: (signal: Signal) => void): () => void;
  /** Exits the process at once (second signal). */
  exit(code: number): never;
  readStdin(): Promise<string>;
  promptSecret(prompt: string): Promise<string>;
}

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

export function nodeRuntime(): Runtime {
  return {
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    fetch: globalThis.fetch.bind(globalThis),
    now: () => Date.now(),
    sleep,
    configDir: defaultConfigDir(process.platform, process.env, homedir()),
    onSignal(handler) {
      const onInt = () => handler("SIGINT");
      const onTerm = () => handler("SIGTERM");
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      return () => {
        process.off("SIGINT", onInt);
        process.off("SIGTERM", onTerm);
      };
    },
    exit: (code) => process.exit(code),
    async readStdin() {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    },
    promptSecret,
  };
}

function promptSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          finish();
          return resolve(value);
        }
        if (ch === "\u0003") {
          finish();
          process.exit(130);
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
