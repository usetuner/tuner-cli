import { resolveTarget } from "../context.js";
import { EXIT } from "../domain/exit.js";
import { type OutputFormat, listDocument } from "../domain/document.js";
import { table } from "../adapters/terminal.js";
import { writeJson } from "../adapters/json.js";
import { type CommandContext, SHORT_GIVE_UP_MS, guard, isJson } from "./shared.js";

interface ListOptions {
  output?: OutputFormat;
  agent?: string;
  tag?: string;
}

function emit(
  ctx: CommandContext,
  output: OutputFormat | undefined,
  key: string,
  items: unknown[],
  headers: string[],
  rows: string[][],
): number {
  if (isJson(output)) {
    writeJson(ctx.runtime.stdout, listDocument(key, items));
  } else if (rows.length === 0) {
    ctx.runtime.stderr.write(`No ${key} found.\n`);
  } else {
    ctx.runtime.stdout.write(table(headers, rows));
  }
  return EXIT.OK;
}

const target = (ctx: CommandContext, needAgent: boolean, agent?: string) =>
  resolveTarget({ ...ctx, agent, needAgent, giveUpMs: SHORT_GIVE_UP_MS });

export function agentsList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const t = await target(ctx, false);
    const agents = await t.client.listAgents(t.workspace.id);
    return emit(
      ctx,
      opts.output,
      "agents",
      agents,
      ["ID", "AGENT ID", "NAME", "DIRECTION"],
      agents.map((a) => [String(a.id), a.remote_identifier, a.name, a.call_direction]),
    );
  });
}

export function scenariosList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const t = await target(ctx, true, opts.agent);
    const { scenarios = [] } = await t.client.listScenarios(t.workspace.id, t.agent!.id, opts.tag);
    return emit(
      ctx,
      opts.output,
      "scenarios",
      scenarios,
      ["ID", "NAME", "TYPE", "TAGS"],
      scenarios.map((s) => [String(s.id), s.name, s.type, (s.tags ?? []).join(", ")]),
    );
  });
}

export function languagesList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const t = await target(ctx, false);
    const { personas } = await t.client.listCallerPersonas(t.workspace.id);
    return emit(
      ctx,
      opts.output,
      "languages",
      personas,
      ["CODE", "NAME"],
      personas.map((p) => [p.code, p.name]),
    );
  });
}

export function noiseList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const t = await target(ctx, false);
    const { environments } = await t.client.listNoiseEnvironments(t.workspace.id);
    return emit(
      ctx,
      opts.output,
      "noise_environments",
      environments,
      ["SLUG", "NAME"],
      environments.map((n) => [n.slug, n.name]),
    );
  });
}

export function profilesList(ctx: CommandContext, opts: ListOptions): Promise<number> {
  return guard(ctx.runtime, async () => {
    const t = await target(ctx, true, opts.agent);
    const { simulation_profiles = [] } = await t.client.listProfiles(t.workspace.id, t.agent!.id);
    return emit(
      ctx,
      opts.output,
      "profiles",
      simulation_profiles,
      ["ID", "NAME"],
      simulation_profiles.map((p) => [String(p.id), p.name]),
    );
  });
}
