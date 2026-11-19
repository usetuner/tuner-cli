import { afterEach, describe, expect, it, vi } from "vitest";
import { TunerClient } from "../../src/adapters/http-client.js";
import { ApiError, NetworkError, UnexpectedResponseError } from "../../src/domain/errors.js";
import { VERSION } from "../../src/adapters/version.js";
import {
  AGENT_PATH,
  BASE,
  FakeApi,
  RUN,
  apiError,
  hang,
  json,
  makeRuntime,
  networkError,
} from "../helpers.js";

afterEach(() => vi.useRealTimers());

const client = (api: FakeApi) =>
  new TunerClient({ baseUrl: BASE, apiKey: "tr_api_k", runtime: makeRuntime(api) });

describe("TunerClient", () => {
  it("sends auth and X-Tuner-Client on every request", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, {}));
    await client(api).whoami("booking-staging");
    const req = api.requests[0]!;
    expect(req.headers.authorization).toBe("Bearer tr_api_k");
    expect(req.headers["x-tuner-client"]).toBe(`cli/${VERSION}`);
    expect(req.url.origin).toBe(BASE);
    expect(req.url.searchParams.get("agent_remote_identifier")).toBe("booking-staging");
  });

  it("omits the agent query when not given", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", json(200, {}));
    await client(api).whoami();
    expect(api.requests[0]!.url.search).toBe("");
  });

  it("parses the error envelope, list detail and extra fields", async () => {
    const api = new FakeApi().on(
      "POST",
      `${AGENT_PATH}/simulation-runs/select`,
      apiError(409, "run_in_flight", "busy", { run_id: 4820, dashboard_url: "u" }),
    );
    const err = await client(api)
      .startRun(12, 77, { tag: "x" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("run_in_flight");
    expect(err.body.run_id).toBe(4820);
    expect(err.retryable).toBe(false);
  });

  it("falls back to a code by status when the body has none", async () => {
    const api = new FakeApi().on(
      "GET",
      `${AGENT_PATH}/simulation-runs/${RUN}`,
      new Response("Internal Server Error", { status: 500 }),
    );
    const err = await client(api)
      .getRun(12, 77, RUN)
      .catch((e) => e);
    expect(err.code).toBe("internal_error");
    expect(err.retryable).toBe(true);
  });

  it("falls back to insufficient_access for a 403 with no code", async () => {
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      new Response("Forbidden", { status: 403 }),
    );
    const err = await client(api)
      .whoami()
      .catch((e) => e);
    expect(err.code).toBe("insufficient_access");
  });

  it("names the status instead of printing an HTML error page", async () => {
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );
    const err = await client(api)
      .whoami()
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.detail).toBe(`502 Bad Gateway from ${BASE}`);
  });

  it.each([
    ["not JSON", "<html>login</html>", "not JSON"],
    ["empty", "", "empty"],
  ])("rejects a 2xx that is %s", async (_n, body, what) => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", new Response(body, { status: 200 }));
    const err = await client(api)
      .whoami()
      .catch((e) => e);
    expect(err).toBeInstanceOf(UnexpectedResponseError);
    expect(err.message).toBe(
      `Tuner sent a response this CLI can't read (200, ${what}) from GET ${BASE}/api/v1/whoami. Check --base-url (or TUNER_BASE_URL).`,
    );
  });

  it("reads Retry-After", async () => {
    const api = new FakeApi().on(
      "GET",
      `${AGENT_PATH}/simulation-runs/${RUN}`,
      apiError(429, "rate_limited", "slow down", {}, { "retry-after": "60" }),
    );
    const err = await client(api)
      .getRun(12, 77, RUN)
      .catch((e) => e);
    expect(err.retryAfterSeconds).toBe(60);
  });

  it.each([
    ["ECONNREFUSED", false],
    ["ENOTFOUND", false],
    ["EAI_AGAIN", false],
    ["UND_ERR_CONNECT_TIMEOUT", false],
    ["ECONNRESET", true],
    ["UND_ERR_SOCKET", true],
  ])("marks %s as sent: %s", async (code, sent) => {
    const api = new FakeApi().on(
      "POST",
      `${AGENT_PATH}/simulation-runs/select`,
      networkError(code),
    );
    const err = await client(api)
      .startRun(12, 77, { tag: "x" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.sent).toBe(sent);
  });

  it("marks the client timeout as sent: the outcome is unknown", async () => {
    vi.useFakeTimers();
    const api = new FakeApi().on("POST", `${AGENT_PATH}/simulation-runs/select`, hang);
    const p = client(api)
      .startRun(12, 77, { tag: "x" })
      .catch((e) => e);
    await vi.advanceTimersByTimeAsync(31_000);
    const err = await p;
    expect(err.message).toBe(`Request to ${BASE} timed out after 30s`);
    expect(err.sent).toBe(true);
  });

  it("searches the agent's runs by status", async () => {
    const api = new FakeApi().on(
      "GET",
      `${AGENT_PATH}/simulation-runs/search`,
      json(200, { simulation_runs: [], total: 0 }),
    );
    await client(api).searchRuns(12, 77, "running");
    expect(api.requests[0]!.url.search).toBe("?run_status=running&limit=1");
  });

  it("wraps network failures", async () => {
    const api = new FakeApi().on("GET", "/api/v1/whoami", networkError());
    const err = await client(api)
      .whoami()
      .catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.message).toContain("ECONNREFUSED");
  });

  it("logs requests with --verbose", async () => {
    const api = new FakeApi().on(
      "GET",
      "/api/v1/whoami",
      json(200, {}, { "x-request-id": "req-1" }),
    );
    const rt = makeRuntime(api);
    await new TunerClient({ baseUrl: BASE, apiKey: "k", runtime: rt, verbose: true }).whoami();
    expect(rt.err()).toMatch(/\[http\] GET \/api\/v1\/whoami 200 \d+ms request-id=req-1/);
  });
});
