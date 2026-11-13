import { scenarioName } from "../domain/document.js";
import type { Summary } from "../domain/run-summary.js";
import type { Run, SimCall, Verdict } from "../domain/types.js";
import type { Output, Runtime, Stream } from "../ports.js";

export function useColor(stream: Stream, runtime: Pick<Runtime, "env">): boolean {
  return Boolean(stream.isTTY) && !runtime.env.NO_COLOR;
}

type Paint = (code: number, text: string) => string;

export function painter(enabled: boolean): Paint {
  return (code, text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : text);
}

const VERDICT_STYLE: Record<Verdict, { mark: string; label: string; color: number }> = {
  passed: { mark: "✓", label: "passed", color: 32 },
  ran: { mark: "✓", label: "ran", color: 32 },
  failed: { mark: "✗", label: "failed", color: 31 },
  not_connected: { mark: "!", label: "not connected", color: 33 },
  platform_error: { mark: "!", label: "platform error", color: 33 },
  unreported: { mark: "!", label: "unreported", color: 33 },
  analysis_failed: { mark: "!", label: "analysis failed", color: 33 },
  canceled: { mark: "-", label: "canceled", color: 90 },
  pending: { mark: "…", label: "pending", color: 90 },
};

export function scenarioLine(call: SimCall, paint: Paint): string {
  const style = VERDICT_STYLE[call.verdict] ?? { mark: "?", label: call.verdict, color: 0 };
  const head = paint(style.color, `${style.mark} ${style.label.padEnd(15)}`);
  const evals = call.failed_evals.map((e) => e.name).filter(Boolean);
  const tail = evals.length ? `   failed evals: ${evals.join(", ")}` : "";
  const failure =
    call.failure_category === "tuner_error" && call.failure?.message
      ? `   ${call.failure.message}`
      : "";
  return `  ${head} ${scenarioName(call)}${tail}${failure}`;
}

export function summaryLine(summary: Summary): string {
  const parts = [
    `${summary.passed} passed`,
    `${summary.failed} failed`,
    `${summary.inconclusive} inconclusive`,
  ];
  if (summary.canceled) parts.push(`${summary.canceled} canceled`);
  if (summary.pending) parts.push(`${summary.pending} pending`);
  return parts.join(" · ");
}

/** Left-aligned columns; the last column is not padded. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  return [line(headers), ...rows.map(line)].join("\n") + "\n";
}

/** `Output` for `sim run`: progress on stderr, each new verdict on the result stream. */
export function terminalOutput(runtime: Runtime, json: boolean): Output {
  const resultStream = json ? runtime.stderr : runtime.stdout;
  const paint = painter(useColor(resultStream, runtime));
  const printed = new Map<number, Verdict>();
  return {
    progress: (line) => runtime.stderr.write(line + "\n"),
    run(run: Run | undefined) {
      for (const call of run?.simulation_calls ?? []) {
        if (call.verdict === "pending" || printed.get(call.scenario_id) === call.verdict) continue;
        printed.set(call.scenario_id, call.verdict);
        resultStream.write(scenarioLine(call, paint) + "\n");
      }
    },
  };
}
