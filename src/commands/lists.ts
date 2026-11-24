import { writeJson } from "../adapters/json.js";
import { intensitiesText, suiteSettingsCells, table } from "../adapters/terminal.js";
import {
  listAgents,
  listLanguages,
  listNoise,
  listProfiles,
  listScenarios,
  listSuites,
} from "../app/lists.js";
import { type OutputFormat, listDocument } from "../domain/document.js";
import { EXIT } from "../domain/exit.js";
import { type CommandContext, guard, isJson } from "./shared.js";

interface ListOptions {
  output?: OutputFormat;
  agent?: string;
  tag?: string;
}

function emit<T>(
  ctx: CommandContext,
  output: OutputFormat | undefined,
  key: string,
  items: T[],
  headers: string[],
  row: (item: T) => string[],
): number {
  if (isJson(output)) {
    writeJson(ctx.runtime.stdout, listDocument(key, items));
  } else if (items.length === 0) {
    ctx.runtime.stderr.write(`No ${key} found.\n`);
  } else {
    ctx.runtime.stdout.write(table(headers, items.map(row)));
  }
  return EXIT.OK;
}

export function agentsList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "agents",
      await listAgents(ctx.deps, ctx.flags),
      ["ID", "AGENT ID", "NAME", "DIRECTION"],
      (a) => [String(a.id), a.remote_identifier, a.name, a.call_direction],
    ),
  );
}

export function scenariosList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "scenarios",
      await listScenarios(ctx.deps, ctx.flags, opts.agent, opts.tag),
      ["ID", "NAME", "TYPE", "TAGS"],
      (s) => [String(s.id), s.name, s.type, (s.tags ?? []).join(", ")],
    ),
  );
}

export function languagesList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "languages",
      await listLanguages(ctx.deps, ctx.flags),
      ["CODE", "NAME"],
      (p) => [p.code, p.name],
    ),
  );
}

export function noiseList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "noise_environments",
      await listNoise(ctx.deps, ctx.flags),
      ["SLUG", "NAME", "INTENSITIES"],
      (n) => [n.slug, n.name, intensitiesText(n.intensities)],
    ),
  );
}

export function profilesList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "profiles",
      await listProfiles(ctx.deps, ctx.flags, opts.agent),
      ["ID", "NAME"],
      (p) => [String(p.id), p.name],
    ),
  );
}

export function suitesList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () =>
    emit(
      ctx,
      opts.output,
      "suites",
      await listSuites(ctx.deps, ctx.flags, opts.agent),
      ["NAME", "SCENARIOS", "MAX CALL", "LANGUAGE", "PROFILE", "NOISE"],
      (s) => [s.name, String(s.scenario_count), ...suiteSettingsCells(s)],
    ),
  );
}
