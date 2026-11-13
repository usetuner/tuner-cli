import type { GlobalFlags } from "../domain/config.js";
import type {
  Agent,
  CallerOptions,
  NoiseEnvironments,
  ProfileList,
  ScenarioList,
} from "../domain/types.js";
import type { AppDeps } from "../ports.js";
import { SHORT_GIVE_UP_MS } from "./retry.js";
import { resolveTarget } from "./target.js";

const target = (deps: AppDeps, flags: GlobalFlags, needAgent: boolean, agent?: string) =>
  resolveTarget(deps, { flags, agent, needAgent, giveUpMs: SHORT_GIVE_UP_MS });

export async function listAgents(deps: AppDeps, flags: GlobalFlags): Promise<Agent[]> {
  const t = await target(deps, flags, false);
  return t.api.listAgents(t.workspace.id);
}

export async function listScenarios(
  deps: AppDeps,
  flags: GlobalFlags,
  agent?: string,
  tag?: string,
): Promise<NonNullable<ScenarioList["scenarios"]>> {
  const t = await target(deps, flags, true, agent);
  const { scenarios = [] } = await t.api.listScenarios(t.workspace.id, t.agent!.id, tag);
  return scenarios;
}

export async function listLanguages(
  deps: AppDeps,
  flags: GlobalFlags,
): Promise<CallerOptions["personas"]> {
  const t = await target(deps, flags, false);
  return (await t.api.listCallerPersonas(t.workspace.id)).personas;
}

export async function listNoise(
  deps: AppDeps,
  flags: GlobalFlags,
): Promise<NoiseEnvironments["environments"]> {
  const t = await target(deps, flags, false);
  return (await t.api.listNoiseEnvironments(t.workspace.id)).environments;
}

export async function listProfiles(
  deps: AppDeps,
  flags: GlobalFlags,
  agent?: string,
): Promise<NonNullable<ProfileList["simulation_profiles"]>> {
  const t = await target(deps, flags, true, agent);
  const { simulation_profiles = [] } = await t.api.listProfiles(t.workspace.id, t.agent!.id);
  return simulation_profiles;
}
