import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Signal } from "../src/domain/exit.js";
import { runCli } from "../src/cli/program.js";
import type { Runtime } from "../src/ports.js";
import { ExitCalled } from "./fakes/signals.js";

export { ExitCalled };
import { sleep } from "../src/adapters/node-runtime.js";
import type { Run, SimCall, Whoami } from "../src/domain/types.js";

export const BASE = "http://127.0.0.1:8010";
export const WS = 12;
export const AGENT = 77;
export const RUN = 4821;
export const AGENT_PATH = `/api/v1/workspaces/${WS}/agents/${AGENT}`;

export interface Recorded {
  method: string;
  url: URL;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
}

type Reply = Response | Error | ((req: Recorded) => Response | Promise<Response>);

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function apiError(
  status: number,
  code: string,
  detail: unknown,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return json(status, { code, detail, ...extra }, headers);
}

export function networkError(code = "ECONNREFUSED"): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

/** A reply that never comes: it rejects only when the request is aborted (client timeout). */
export function hang(req: Recorded): Promise<Response> {
  return new Promise((_, reject) =>
    req.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
  );
}

/** Routes by method and path; each route replays its replies in order, repeating the last. */
export class FakeApi {
  readonly requests: Recorded[] = [];
  private readonly routes: { method: string; path: string; replies: Reply[]; calls: number }[] = [];

  on(method: string, path: string, ...replies: Reply[]): this {
    this.routes.unshift({ method, path, replies, calls: 0 });
    return this;
  }

  calls(method: string, path: string): Recorded[] {
    return this.requests.filter((r) => r.method === method && r.path === path);
  }

  fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    const req: Recorded = {
      method: init?.method ?? "GET",
      url,
      path: url.pathname,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      signal: init?.signal ?? undefined,
    };
    this.requests.push(req);
    const route = this.routes.find((r) => r.method === req.method && r.path === req.path);
    if (!route)
      return apiError(404, "validation_error", `No fake route for ${req.method} ${req.path}`);
    const reply = route.replies[Math.min(route.calls, route.replies.length - 1)]!;
    route.calls += 1;
    if (reply instanceof Error) throw reply;
    if (typeof reply === "function") return (await reply(req)).clone();
    return reply.clone();
  }) as typeof fetch;
}

export interface TestRuntime extends Runtime {
  out(): string;
  err(): string;
  emit(signal: Signal): void;
  exits: number[];
}

export function makeRuntime(
  api: FakeApi,
  opts: {
    env?: Record<string, string | undefined>;
    stdinIsTTY?: boolean;
    stdin?: string;
    secret?: string;
  } = {},
): TestRuntime {
  let out = "";
  let err = "";
  const handlers = new Set<(s: Signal) => void>();
  const exits: number[] = [];
  return {
    env: {
      TUNER_BASE_URL: BASE,
      TUNER_API_KEY: "tr_api_test",
      TUNER_AGENT_ID: "booking-staging",
      ...opts.env,
    },
    stdout: { write: (s: string) => void (out += s), isTTY: false },
    stderr: { write: (s: string) => void (err += s), isTTY: false },
    stdinIsTTY: opts.stdinIsTTY ?? false,
    fetch: api.fetch,
    now: () => Date.now(),
    sleep,
    configDir: mkdtempSync(join(tmpdir(), "tuner-cli-test-")),
    onSignal(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    exit(code: number): never {
      exits.push(code);
      throw new ExitCalled(code);
    },
    readStdin: async () => opts.stdin ?? "",
    promptSecret: async () => opts.secret ?? "",
    out: () => out,
    err: () => err,
    emit(signal) {
      for (const h of [...handlers]) h(signal);
    },
    exits,
  };
}

export function run(runtime: Runtime, ...argv: string[]): Promise<number> {
  return runCli(argv, runtime);
}

export const whoami = (agent: Whoami["agent"] = defaultAgent): Whoami => ({
  workspace: { id: WS, name: "Acme" },
  api_key: { name: "ci-staging", last_four: "9f3a", created_at: "2026-10-01T09:12:00Z" },
  agent,
});

export const defaultAgent = {
  id: AGENT,
  remote_identifier: "booking-staging",
  name: "Booking (staging)",
};

export function call(overrides: Partial<SimCall> = {}): SimCall {
  return {
    id: 99812,
    scenario_id: 311,
    type: "functional",
    status: "completed",
    duration: 1.5,
    outcome: null,
    intent: null,
    evals: [],
    call_id: 5001,
    verdict: "passed",
    failure_category: null,
    failed_evals: [],
    persona: "Reschedule an existing booking",
    saved_scenario_id: 42,
    ...overrides,
  } as SimCall;
}

export function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: RUN,
    status: "completed",
    created_at: "2026-11-04T10:00:00Z",
    execution_completed_at: "2026-11-04T10:08:40Z",
    failure_reason: null,
    functional_count: 1,
    adversarial_count: 0,
    generated_count: 1,
    caller_persona_id: 1,
    caller_persona: {
      id: 1,
      name: "English (American)",
      language: "English",
      language_code: "en",
      accent: "American",
      label: "English (American)",
      country_code: "US",
      code: "en-US",
    },
    simulation_profile_name: null,
    noise_environment: { id: 2, name: "Café", slug: "cafe" },
    noise_intensity: 1,
    selected_evals: [],
    selected_intents: [],
    passed_count: 1,
    failed_count: 0,
    in_progress_count: 0,
    simulation_calls: [call()],
    result: "passed",
    reason: null,
    is_terminal: true,
    dashboard_url: `https://app.usetuner.ai/simulations?agent=${AGENT}&run=${RUN}`,
    run_mode: "select",
    ...overrides,
  } as Run;
}

export const pendingRun = (overrides: Partial<Run> = {}) =>
  makeRun({
    status: "running",
    result: "pending",
    reason: null,
    is_terminal: false,
    execution_completed_at: null,
    simulation_calls: [call({ verdict: "pending", status: "in_progress", call_id: null })],
    ...overrides,
  });

export const started = (count = 1) =>
  json(202, { simulation_run_id: RUN, generated_count: count, success: true });

/** A FakeApi with whoami, start and a terminal Get a run. */
export function happyApi(final: Run = makeRun()): FakeApi {
  return new FakeApi()
    .on("GET", "/api/v1/whoami", json(200, whoami()))
    .on("POST", `${AGENT_PATH}/simulation-runs/select`, started())
    .on("GET", `${AGENT_PATH}/simulation-runs/${RUN}`, json(200, final));
}
