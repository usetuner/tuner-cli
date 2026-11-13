import type { Runtime, Stream } from "./runtime.js";
import { scenarioName } from "./domain/document.js";
import type { Summary } from "./domain/run-summary.js";
import type { SimCall, Verdict } from "./domain/types.js";

export function useColor(stream: Stream, runtime: Runtime): boolean {
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

export function writeJson(stream: Stream, value: unknown): void {
  stream.write(JSON.stringify(value, null, 2) + "\n");
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
