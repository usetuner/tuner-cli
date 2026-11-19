import { summarize } from "./run-summary.js";
import type { ResolvedAgent, Run, SimCall } from "./types.js";

export type OutputFormat = "text" | "json";

export const SCHEMA_VERSION = 1;

export function scenarioName(call: SimCall): string {
  return call.persona || call.clip_set_name || `Scenario ${call.scenario_id}`;
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
            ? {
                id: input.agent.id,
                remote_id: input.agent.remote_identifier,
                name: input.agent.name,
              }
            : null,
          config: {
            language: run?.caller_persona?.code ?? null,
            profile: run?.simulation_profile_name ?? null,
            noise: run?.noise_environment?.slug ?? null,
            noise_intensity: run?.noise_intensity ?? null,
          },
          metadata: run?.metadata ?? null,
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

/** The `--output json` document of a list command. */
export function listDocument(key: string, items: unknown[]): Record<string, unknown> {
  return { schema_version: SCHEMA_VERSION, [key]: items };
}
