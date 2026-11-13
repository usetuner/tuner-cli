import { parseDuration } from "./duration.js";
import { CliError, detailText } from "./errors.js";
import type { StartRunRequest } from "./types.js";

export const DEFAULT_TIMEOUT = "60m";

export interface StartOptions {
  tag?: string;
  scenario?: string[];
  language?: string;
  profile?: string;
  noise?: string;
}

export function parseRunId(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new CliError(`Invalid run ID '${value}'. Use the numeric run ID.`, "usage_error");
  }
  return Number(value);
}

export function parseScenarioIds(values: string[]): number[] {
  const ids = values
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new CliError(
        `Invalid scenario ID '${id}'. Use numeric IDs from \`tuner scenarios list\`.`,
        "usage_error",
      );
    }
  }
  return ids.map(Number);
}

export function parseTimeout(value: string): number {
  try {
    return parseDuration(value);
  } catch (err) {
    throw new CliError(detailText((err as Error).message), "usage_error");
  }
}

export function buildStartBody(opts: StartOptions): StartRunRequest {
  const scenarios = opts.scenario ?? [];
  if (Boolean(opts.tag) === scenarios.length > 0) {
    throw new CliError("Pass exactly one of --tag or --scenario.", "usage_error");
  }
  const body: StartRunRequest = {};
  if (opts.tag) body.tag = opts.tag;
  else body.selected_scenario_ids = parseScenarioIds(scenarios);
  if (opts.language) body.language = opts.language;
  if (opts.profile) body.profile = opts.profile;
  if (opts.noise) body.noise = opts.noise;
  return body;
}
