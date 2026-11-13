#!/usr/bin/env node
import { runCli } from "./program.js";
import { nodeRuntime } from "./adapters/node-runtime.js";

runCli(process.argv.slice(2), nodeRuntime(process)).then(
  (code) => {
    // Let piped stdout drain before exiting.
    process.stdout.write("", () => process.exit(code));
  },
  (err: unknown) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  },
);
