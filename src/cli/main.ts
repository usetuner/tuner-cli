#!/usr/bin/env node
import { nodeRuntime } from "../adapters/node-runtime.js";
import { runCli } from "./program.js";

runCli(process.argv.slice(2), nodeRuntime(process)).then(
  (code) => {
    // Let piped stdout drain before exiting.
    process.stdout.write("", () => process.exit(code));
  },
  (err: unknown) => {
    // A crash is never the customer's to fix: report it as Tuner's side.
    process.stderr.write(
      `Error: Unexpected error: ${err instanceof Error ? err.message : String(err)}. Re-run with --verbose and report it.\n`,
    );
    process.exit(3);
  },
);
