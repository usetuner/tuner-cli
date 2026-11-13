import type { Runtime, Stream } from "./runtime.js";
import type { ResolvedAgent, Run, SimCall, Verdict } from "./types.js";

export type OutputFormat = "text" | "json";

export const SCHEMA_VERSION = 1;

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

export function scenarioName(call: SimCall): string {
  return call.persona || call.clip_set_name || `Scenario ${call.scenario_id}`;
}

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

export interface Summary {
  total: number;
  passed: number;
  failed: number;
  inconclusive: number;
  canceled: number;
  pending: number;
}

const INCONCLUSIVE: Verdict[] = ["not_connected", "platform_error", "unreported", "analysis_failed"];

export function summarize(run: Run | undefined): Summary {
  const summary: Summary = { total: 0, passed: 0, failed: 0, inconclusive: 0, canceled: 0, pending: 0 };
  for (const call of run?.simulation_calls ?? []) {
    summary.total += 1;
    if (call.verdict === "passed" || call.verdict === "ran") summary.passed += 1;
    else if (call.verdict === "failed") summary.failed += 1;
    else if (call.verdict === "canceled") summary.canceled += 1;
    else if (INCONCLUSIVE.includes(call.verdict)) summary.inconclusive += 1;
    else summary.pending += 1;
  }
  return summary;
}

export function summaryLine(summary: Summary): string {
  const parts = [`${summary.passed} passed`, `${summary.failed} failed`, `${summary.inconclusive} inconclusive`];
  if (summary.canceled) parts.push(`${summary.canceled} canceled`);
  if (summary.pending) parts.push(`${summary.pending} pending`);
  return parts.join(" · ");
}

export interface DocumentInput {
  run?: Run;
  runId?: number;
  workspace?: { id: number; name: string };
  agent?: ResolvedAgent;
  reason: string | null;
  exitCode: number;
  error?: { code: string; message: string; [key: string]: unknown };
}

/** The `--output json` document, `schema_version: 1`. */
export function buildDocument(input: DocumentInput): Record<string, unknown> {
  const { run } = input;
  const runPart =
    run || input.runId !== undefined
      ? {
          id: run?.id ?? input.runId,
          status: run?.status ?? null,
          result: run?.result ?? null,
          is_terminal: run?.is_terminal ?? false,
          dashboard_url: run?.dashboard_url ?? null,
          workspace: input.workspace ?? null,
          agent: input.agent
            ? { id: input.agent.id, remote_id: input.agent.remote_identifier, name: input.agent.name }
            : null,
          config: {
            language: run?.caller_persona?.code ?? null,
            profile: run?.simulation_profile_name ?? null,
            noise: run?.noise_environment?.slug ?? null,
          },
          started_at: run?.created_at ?? null,
          completed_at: run?.execution_completed_at ?? null,
        }
      : null;
  const doc: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    run: runPart,
    summary: summarize(run),
    scenarios: (run?.simulation_calls ?? []).map((call) => ({
      scenario_id: call.scenario_id,
      library_scenario_id: call.saved_scenario_id ?? null,
      name: scenarioName(call),
      verdict: call.verdict,
      failure_category: call.failure_category ?? null,
      failed_evals: call.failed_evals.map((e) => ({ name: e.name, value: e.value })),
      call_id: call.call_id ?? null,
    })),
    reason: input.reason,
    exit_code: input.exitCode,
  };
  if (input.error) doc.error = input.error;
  return doc;
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
