import type { GlobalFlags } from "../domain/config.js";
import type { OutputFormat } from "../domain/document.js";
import { toCliError } from "../domain/error-message.js";
import { EXIT } from "../domain/exit.js";
import type { AppDeps, Runtime } from "../ports.js";

export interface CommandContext {
  flags: GlobalFlags;
  runtime: Runtime;
  deps: AppDeps;
}

export function printError(runtime: Runtime, message: string): void {
  runtime.stderr.write(`Error: ${message}\n`);
}

/** Runs a command body; any error is printed and exits with its code (2 by default). */
export async function guard(runtime: Runtime, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (err) {
    const cli = toCliError(err);
    printError(runtime, cli.message);
    return cli.exitCode || EXIT.USAGE;
  }
}

export function isJson(output: OutputFormat | undefined): boolean {
  return output === "json";
}
