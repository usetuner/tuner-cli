import { parseDuration } from "./duration.js";
import { CliError, detailText } from "./errors.js";
import type { RunMetadata, StartRunRequest } from "./types.js";

export const DEFAULT_TIMEOUT = "60m";

export interface StartOptions {
  tag?: string;
  scenario?: string[];
  suite?: string;
  language?: string;
  profile?: string;
  noise?: string;
  noiseIntensity?: string;
  meta?: string[];
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

/** A number when the value is numeric, else the name as typed; the API resolves both. */
export function parseNoiseIntensity(value: string): string | number {
  return /^\d+(\.\d*)?$|^\.\d+$/.test(value.trim()) ? Number(value) : value;
}

/** A suite brings its own scenarios and settings, so none of these flags may go with --suite. */
function flagSentWithSuite(opts: StartOptions): string | undefined {
  if (opts.tag) return "--tag";
  if ((opts.scenario ?? []).length > 0) return "--scenario";
  if (opts.language) return "--language";
  if (opts.profile) return "--profile";
  if (opts.noise) return "--noise";
  if (opts.noiseIntensity !== undefined) return "--noise-intensity";
  return undefined;
}

/** `--meta key=value` pairs, split on the first `=`. The API enforces the limits. */
export function parseMetadata(values: string[]): RunMetadata {
  const pairs = new Map<string, string>();
  for (const pair of values) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new CliError(`Invalid --meta '${pair}'. Use key=value.`, "usage_error");
    const key = pair.slice(0, eq);
    if (!key) {
      throw new CliError(
        `Invalid --meta '${pair}': the key is empty. Use key=value.`,
        "usage_error",
      );
    }
    if (pairs.has(key)) {
      throw new CliError(`Duplicate --meta key '${key}'. Pass each key once.`, "usage_error");
    }
    pairs.set(key, pair.slice(eq + 1));
  }
  // fromEntries defines own properties, so a `__proto__` key stays a plain key.
  return Object.fromEntries(pairs);
}

export function buildStartBody(opts: StartOptions): StartRunRequest {
  const scenarios = opts.scenario ?? [];
  if (opts.suite) {
    const flag = flagSentWithSuite(opts);
    if (flag) throw new CliError(`--suite can't be combined with ${flag}.`, "usage_error");
    const suiteBody: StartRunRequest = { suite: opts.suite };
    if (opts.meta?.length) suiteBody.metadata = parseMetadata(opts.meta);
    return suiteBody;
  }
  if (Boolean(opts.tag) === scenarios.length > 0) {
    throw new CliError("Pass exactly one of --tag, --scenario or --suite.", "usage_error");
  }
  const body: StartRunRequest = {};
  if (opts.tag) body.tag = opts.tag;
  else body.selected_scenario_ids = parseScenarioIds(scenarios);
  if (opts.language) body.language = opts.language;
  if (opts.profile) body.profile = opts.profile;
  if (opts.noise) body.noise = opts.noise;
  if (opts.noiseIntensity !== undefined) {
    if (!opts.noise) {
      throw new CliError("--noise-intensity needs --noise <slug>.", "usage_error");
    }
    // Out-of-set values still go out so the API's 422 is what people see.
    body.noise_intensity = parseNoiseIntensity(
      opts.noiseIntensity,
    ) as StartRunRequest["noise_intensity"];
  }
  if (opts.meta?.length) body.metadata = parseMetadata(opts.meta);
  return body;
}
