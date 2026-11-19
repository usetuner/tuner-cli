import type { RunReason } from "./exit.js";

const KNOWN_RESULTS = new Set(["passed", "failed", "inconclusive", "canceled", "pending", null]);
const KNOWN_REASONS = new Set<string | null>([
  "agent_failed",
  "tuner_error",
  "timeout",
  "canceled",
  null,
]);

/** The line `sim run` prints for how a run ended; undefined when it passed. */
export function runEndMessage(
  runId: number,
  result: string | null,
  reason: RunReason | string | null,
): string | undefined {
  if (!KNOWN_RESULTS.has(result) || !KNOWN_REASONS.has(reason)) {
    return (
      `Tuner returned a result this CLI doesn't know (result: ${result ?? "null"}, ` +
      `reason: ${reason ?? "null"}). Upgrade tuner-cli.`
    );
  }
  if (result === "failed" || reason === "agent_failed") return "Result: failed (agent_failed)";
  if (reason === "canceled") {
    return `Run ${runId} was canceled outside this command (the dashboard or \`tuner runs cancel\`).`;
  }
  if (result === "passed" && reason === null) return undefined;
  return `Tuner couldn't finish this run (${reason ?? "tuner_error"}).`;
}
