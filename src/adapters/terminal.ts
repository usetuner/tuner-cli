import { scenarioName } from "../domain/document.js";
import { type Summary, summarize } from "../domain/run-summary.js";
import type { Run, SimCall, Suite, Verdict } from "../domain/types.js";
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
  setup_error: { mark: "!", label: "setup error", color: 33 },
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
    (call.failure_category === "tuner_error" || call.failure_category === "setup_error") &&
    call.failure?.message
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

/** A gain as the API lists it: `1` prints as `1.0`. */
export function gainText(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

/** `low 0.5 · medium 1.0 · high 1.5`, or `-` when the API sends none. */
export function intensitiesText(intensities?: { name: string; value: number }[]): string {
  if (!intensities?.length) return "-";
  return intensities.map((i) => `${i.name} ${gainText(i.value)}`).join(" · ");
}

/** `Noise: office · intensity 1.5`, or undefined when the run plays no noise. */
export function noiseLine(run: Run | undefined): string | undefined {
  const slug = run?.noise_environment?.slug;
  if (!slug) return undefined;
  const gain = run.noise_intensity;
  return `Noise: ${slug}${gain != null ? ` · intensity ${gainText(gain)}` : ""}`;
}

/** A suite's run settings as table cells: max call, language, profile, noise. */
export function suiteSettingsCells(suite: Suite): string[] {
  const s = suite.settings;
  const noise = s.noise_environment?.slug;
  return [
    `${s.max_call_duration_minutes}m`,
    s.caller_persona?.code ?? "-",
    suite.profile_deleted ? "(deleted)" : (s.simulation_profile_name ?? "-"),
    noise ? `${noise}${s.noise_intensity != null ? ` ${gainText(s.noise_intensity)}` : ""}` : "-",
  ];
}

/** `Metadata: commit=abc · env=staging`, or undefined when the run has none. */
export function metadataLine(run: Run | undefined): string | undefined {
  const entries = Object.entries(run?.metadata ?? {});
  if (!entries.length) return undefined;
  // Strip control characters so stored values can't inject terminal escapes or newlines.
  // eslint-disable-next-line no-control-regex
  const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
  const text = (v: unknown) => clean(typeof v === "string" ? v : JSON.stringify(v));
  return `Metadata: ${entries.map(([k, v]) => `${clean(k)}=${text(v)}`).join(" · ")}`;
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

/** `runs get` in text. */
export function writeRun(runtime: Pick<Runtime, "stdout" | "env">, run: Run): void {
  const { stdout } = runtime;
  const paint = painter(useColor(stdout, runtime));
  const reason = run.reason ? ` (${run.reason})` : "";
  stdout.write(`Run ${run.id} · ${run.status} · result ${run.result}${reason}\n`);
  const extra = [noiseLine(run), metadataLine(run)].filter(Boolean);
  stdout.write(extra.length ? `${extra.join("\n")}\n\n` : "\n");
  for (const call of run.simulation_calls) stdout.write(scenarioLine(call, paint) + "\n");
  stdout.write(`\n${summaryLine(summarize(run))}\n${run.dashboard_url}\n`);
}

/** `runs cancel` in text. */
export function cancelText(run: Run): string {
  if (run.status === "canceled") return `Run ${run.id} canceled.\n${run.dashboard_url}\n`;
  if (run.is_terminal) {
    return `Run ${run.id} already finished: status ${run.status}, result ${run.result}.\n${run.dashboard_url}\n`;
  }
  return `Run ${run.id} is ${run.status}: its calls are done and analysis continues.\n${run.dashboard_url}\n`;
}
