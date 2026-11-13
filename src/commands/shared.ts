import type { GlobalFlags } from "../domain/config.js";
import { toCliError } from "../domain/error-message.js";
import { EXIT } from "../domain/exit.js";
import type { OutputFormat } from "../domain/document.js";
import type { Runtime } from "../runtime.js";

/** Retry budget for commands other than `sim run`. */
export const SHORT_GIVE_UP_MS = 30_000;

export interface CommandContext {
  flags: GlobalFlags;
  runtime: Runtime;
}

export function printError(runtime: Runtime, message: string): void {
  runtime.stderr.write(`Error: ${message}\n`);
}

/** Runs a command body; any error is printed and exits 2. */
export async function guard(runtime: Runtime, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (err) {
    const cli = toCliError(err);
    printError(runtime, cli.message);
    return cli.exitCode || EXIT.NOTHING_RAN;
  }
}

export function isJson(output: OutputFormat | undefined): boolean {
  return output === "json";
}
