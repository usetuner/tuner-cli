import type { components } from "../generated/api.js";

type Schemas = components["schemas"];

export type Whoami = Schemas["WhoamiResponse"];
export type Agent = Schemas["Agent"];
/** Run metadata, stored as sent with `--meta`. */
export type RunMetadata = Record<string, string>;
// The deployed schema doesn't return `metadata` or `tag` yet; drop this once the types are regenerated.
// Older runs may hold any JSON object, so values are not always strings.
export type Run = Schemas["SimulationRunGetResponse"] & {
  metadata?: Record<string, unknown> | null;
  tag?: string | null;
};
export type SimCall = Schemas["SimulationCallDetailResponse"];
export type Verdict = Schemas["Verdict"];
export type RunResult = Schemas["RunResult"];
export type FailureCategory = Schemas["FailureCategory"];
export type ErrorCode = Schemas["ErrorCode"];
export type StartRunRequest = Schemas["CreateSelectSimulationRunRequest"];
export type StartRunResponse = Schemas["SimulationRunResponse"];
export type RunSearch = Schemas["SimulationRunSearchResponse"];
export type RunStatus = "pending" | "running";
export type ScenarioList = Schemas["ScenarioListResponse"];
export type CallerOptions = Schemas["CallerOptionsResponse"];
export type NoiseEnvironments = Schemas["NoiseEnvironmentsResponse"];
export type ProfileList = Schemas["SimulationProfileListResponse"];

/** Agent identity as the CLI prints it. */
export interface ResolvedAgent {
  id: number;
  remote_identifier: string;
  name: string;
}
