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
  maxConcurrentCalls?: string;
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

export function parseMaxConcurrentCalls(value: string): number {
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > 10) {
    throw new CliError(
      `Invalid --max-concurrent-calls '${value}'. Use a whole number from 1 to 10.`,
      "usage_error",
    );
  }
  return Number(value);
}

/** A number when the value is numeric, else the name as typed; the API resolves both. */
export function parseNoiseIntensity(value: string): string | number {
  return /^\d+(\.\d*)?$|^\.\d+$/.test(value.trim()) ? Number(value) : value;
}

/** A suite brings its own scenarios and settings, so none of these flags may go with --suite. */
function flagSentWithSuite(opts: StartOptions): string | undefined {
  if (opts.tag !== undefined) return "--tag";
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

/** An empty or blank value, e.g. from an unset shell variable, must not read as "flag not passed". */
function rejectBlank(flag: string, value: string | undefined, what: string): void {
  if (value !== undefined && !value.trim()) {
    throw new CliError(`${flag} needs ${what}; got an empty value.`, "usage_error");
  }
}

export function buildStartBody(opts: StartOptions): StartRunRequest {
  const scenarios = opts.scenario ?? [];
  rejectBlank("--suite", opts.suite, "a suite name");
  rejectBlank("--tag", opts.tag, "a tag");
  if (opts.suite !== undefined) {
    const flag = flagSentWithSuite(opts);
    if (flag) throw new CliError(`--suite can't be combined with ${flag}.`, "usage_error");
    const suiteBody: StartRunRequest = { suite: opts.suite };
    addMaxConcurrentCalls(suiteBody, opts);
    if (opts.meta?.length) suiteBody.metadata = parseMetadata(opts.meta);
    return suiteBody;
  }
  if ((opts.tag !== undefined) === scenarios.length > 0) {
    throw new CliError("Pass exactly one of --tag, --scenario or --suite.", "usage_error");
  }
  const body: StartRunRequest = {};
  if (opts.tag !== undefined) body.tag = opts.tag;
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
  addMaxConcurrentCalls(body, opts);
  if (opts.meta?.length) body.metadata = parseMetadata(opts.meta);
  return body;
}

/** Omitted means the key stays out, so the API uses the agent's saved value. */
function addMaxConcurrentCalls(body: StartRunRequest, opts: StartOptions): void {
  if (opts.maxConcurrentCalls !== undefined) {
    body.max_concurrent_calls = parseMaxConcurrentCalls(opts.maxConcurrentCalls);
  }
}
