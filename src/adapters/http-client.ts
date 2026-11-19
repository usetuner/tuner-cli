import { ApiError, NetworkError, UnexpectedResponseError } from "../domain/errors.js";
import type { Runtime, TunerApi } from "../ports.js";
import type {
  Agent,
  CallerOptions,
  NoiseEnvironments,
  ProfileList,
  Run,
  ScenarioList,
  StartRunRequest,
  StartRunResponse,
  Whoami,
} from "../domain/types.js";
import { CLIENT_HEADER, VERSION } from "./version.js";

const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_ID_HEADERS = ["x-request-id", "x-amzn-requestid", "x-amzn-trace-id"];

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  runtime: Pick<Runtime, "fetch" | "now" | "stderr">;
  verbose?: boolean;
}

interface RequestOptions {
  query?: Record<string, string | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

/** `TunerApi` over HTTP: 30 s timeout per request, typed errors, no retries. */
export class TunerClient implements TunerApi {
  constructor(private readonly opts: ClientOptions) {}

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { runtime, verbose } = this.opts;
    const url = new URL(this.opts.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      "X-Tuner-Client": CLIENT_HEADER,
      "User-Agent": `tuner-cli/${VERSION}`,
      Accept: "application/json",
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
    const onOuterAbort = () => timeout.abort();
    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    const started = runtime.now();
    let response: Response;
    try {
      response = await runtime.fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: timeout.signal,
      });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const cause = (err as { cause?: { code?: string } }).cause?.code;
      const message = timeout.signal.aborted
        ? `Request to ${url.origin} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Could not reach ${url.origin}${cause ? ` (${cause})` : ""}`;
      if (verbose) runtime.stderr.write(`[http] ${method} ${url.pathname} failed: ${message}\n`);
      throw new NetworkError(message);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (verbose) {
      const requestId = REQUEST_ID_HEADERS.map((h) => response.headers.get(h)).find(Boolean);
      runtime.stderr.write(
        `[http] ${method} ${url.pathname}${url.search} ${response.status} ${runtime.now() - started}ms` +
          (requestId ? ` request-id=${requestId}` : "") +
          "\n",
      );
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
    }
    if (!response.ok) {
      const body = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
      const code = typeof body.code === "string" ? body.code : fallbackCode(response.status);
      // A proxy or wrong --base-url sends HTML; name the status instead of printing the page.
      const plain = text.trim();
      const detail =
        "detail" in body
          ? body.detail
          : plain && !plain.startsWith("<") && plain.length <= 200
            ? plain
            : `${response.status} ${response.statusText || "error"} from ${url.origin}`;
      throw new ApiError(response.status, code, detail, body, retryAfter(response.headers));
    }
    if (parsed === undefined) {
      throw new UnexpectedResponseError(
        `Tuner sent a response this CLI can't read (${response.status}, ${text ? "not JSON" : "empty"}) from ` +
          `${method} ${url.origin}${url.pathname}. Check --base-url (or TUNER_BASE_URL).`,
      );
    }
    return parsed as T;
  }

  whoami(agentRemoteIdentifier?: string, signal?: AbortSignal): Promise<Whoami> {
    return this.request("GET", "/api/v1/whoami", {
      query: { agent_remote_identifier: agentRemoteIdentifier },
      signal,
    });
  }

  getAgent(workspaceId: number, agentId: string): Promise<Agent> {
    return this.request("GET", `${ws(workspaceId)}/agents/${enc(agentId)}`);
  }

  listAgents(workspaceId: number): Promise<Agent[]> {
    return this.request("GET", `${ws(workspaceId)}/agents/`);
  }

  startRun(
    workspaceId: number,
    agentId: number,
    body: StartRunRequest,
    signal?: AbortSignal,
  ): Promise<StartRunResponse> {
    return this.request("POST", `${agent(workspaceId, agentId)}/simulation-runs/select`, {
      body,
      signal,
    });
  }

  getRun(workspaceId: number, agentId: number, runId: number, signal?: AbortSignal): Promise<Run> {
    return this.request("GET", `${agent(workspaceId, agentId)}/simulation-runs/${runId}`, {
      signal,
    });
  }

  cancelRun(workspaceId: number, agentId: number, runId: number): Promise<Run> {
    return this.request("POST", `${agent(workspaceId, agentId)}/simulation-runs/${runId}/cancel`);
  }

  listScenarios(workspaceId: number, agentId: number, tag?: string): Promise<ScenarioList> {
    return this.request("GET", `${agent(workspaceId, agentId)}/scenarios`, { query: { tag } });
  }

  listCallerPersonas(workspaceId: number): Promise<CallerOptions> {
    return this.request("GET", `${ws(workspaceId)}/caller-personas`);
  }

  listNoiseEnvironments(workspaceId: number): Promise<NoiseEnvironments> {
    return this.request("GET", `${ws(workspaceId)}/noise-environments`);
  }

  listProfiles(workspaceId: number, agentId: number): Promise<ProfileList> {
    return this.request("GET", `${agent(workspaceId, agentId)}/simulation-profiles`);
  }
}

const ws = (workspaceId: number) => `/api/v1/workspaces/${workspaceId}`;
const agent = (workspaceId: number, agentId: number) => `${ws(workspaceId)}/agents/${agentId}`;
const enc = encodeURIComponent;

function fallbackCode(status: number): string {
  if (status === 401) return "invalid_api_key";
  if (status === 402) return "insufficient_credits";
  if (status === 403) return "insufficient_access";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  return "validation_error";
}

function retryAfter(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, (date - Date.now()) / 1000);
}
