import type { Env } from "./domain/config.js";
import type { Signal } from "./domain/exit.js";
import type {
  Agent,
  CallerOptions,
  NoiseEnvironments,
  ProfileList,
  Run,
  RunSearch,
  RunStatus,
  ScenarioList,
  StartRunRequest,
  StartRunResponse,
  Whoami,
} from "./domain/types.js";

/** The Tuner public API. Adapter: `adapters/http-client.ts`. */
export interface TunerApi {
  whoami(agentRemoteIdentifier?: string, signal?: AbortSignal): Promise<Whoami>;
  getAgent(workspaceId: number, agentId: string): Promise<Agent>;
  listAgents(workspaceId: number): Promise<Agent[]>;
  startRun(
    workspaceId: number,
    agentId: number,
    body: StartRunRequest,
    signal?: AbortSignal,
  ): Promise<StartRunResponse>;
  /** The agent's runs with this status, newest first. */
  searchRuns(workspaceId: number, agentId: number, status: RunStatus): Promise<RunSearch>;
  getRun(workspaceId: number, agentId: number, runId: number, signal?: AbortSignal): Promise<Run>;
  cancelRun(workspaceId: number, agentId: number, runId: number): Promise<Run>;
  listScenarios(workspaceId: number, agentId: number, tag?: string): Promise<ScenarioList>;
  listCallerPersonas(workspaceId: number): Promise<CallerOptions>;
  listNoiseEnvironments(workspaceId: number): Promise<NoiseEnvironments>;
  listProfiles(workspaceId: number, agentId: number): Promise<ProfileList>;
}

/** The stored API key. Adapter: `adapters/credential-store.ts`. */
export interface CredentialStore {
  readonly path: string;
  read(): Promise<string | undefined>;
  /** Writes the key with mode 0600 and returns the file path. */
  write(apiKey: string): Promise<string>;
  /** Returns true when a stored key was removed. */
  delete(): Promise<boolean>;
}

/** Time. Adapter: `adapters/node-runtime.ts`. */
export interface Clock {
  now(): number;
  /** Resolves early (never rejects) when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** SIGINT and SIGTERM. Adapter: `adapters/node-runtime.ts`. */
export interface Signals {
  onSignal(handler: (signal: Signal) => void): () => void;
  /** Exits the process at once (second signal). */
  exit(code: number): never;
}

/** What people see while `sim run` works. Adapter: `adapters/terminal.ts`. */
export interface Output {
  /** A line for people, on stderr. */
  progress(line: string): void;
  /** Shows scenario verdicts that changed since the last call. */
  run(run: Run | undefined): void;
}

/** The ports a use case reads. */
export interface AppDeps {
  env: Env;
  clock: Clock;
  credentials: CredentialStore;
  connect(baseUrl: string, apiKey: string): TunerApi;
}

export interface Stream {
  write(text: string): void;
  isTTY?: boolean;
}

/** Everything the CLI touches outside itself; only `cli/main.ts` builds the real one. */
export interface Runtime extends Clock, Signals {
  env: Env;
  stdout: Stream;
  stderr: Stream;
  stdinIsTTY: boolean;
  fetch: typeof fetch;
  configDir: string;
  readStdin(): Promise<string>;
  promptSecret(prompt: string): Promise<string>;
}
