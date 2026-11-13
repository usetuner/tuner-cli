import { afterEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "../../src/adapters/version.js";
import {
  AGENT_PATH,
  ExitCalled,
  FakeApi,
  RUN,
  WS,
  apiError,
  call,
  defaultAgent,
  happyApi,
  json,
  makeRun,
  makeRuntime,
  networkError,
  pendingRun,
  run,
  started,
  whoami,
} from "../helpers.js";

const SELECT = `${AGENT_PATH}/simulation-runs/select`;
const GET = `${AGENT_PATH}/simulation-runs/${RUN}`;
const CANCEL = `${GET}/cancel`;

afterEach(() => vi.useRealTimers());

const failedRun = () =>
  makeRun({
    status: "partial",
    result: "failed",
    reason: "agent_failed",
    simulation_calls: [
      call(),
      call({
        scenario_id: 312,
        persona: "Caller asks for a refund",
        verdict: "failed",
        failure_category: "agent_failed",
        failed_evals: [
          { name: "Refund policy", value: "FAIL" },
          { name: "Escalation", value: "FAIL" },
        ],
      }),
    ],
  });

const inconclusiveRun = () =>
  makeRun({
    result: "inconclusive",
    reason: "tuner_error",
    simulation_calls: [
      call({
        verdict: "not_connected",
        failure_category: "tuner_error",
        call_id: null,
        failure: { reason: "no_answer", title: "No answer", message: "The agent did not answer" },
      } as never),
    ],
  });

const canceledRun = () =>
  makeRun({
    status: "canceled",
    result: "canceled",
    reason: "canceled",
    simulation_calls: [call({ verdict: "canceled", failure_category: "canceled" })],
  });

describe("sim run: results and exit codes", () => {
  it("exits 0 on a passed run and prints scenario lines and the dashboard URL", async () => {
    const api = happyApi();
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--tag", "smoke")).toBe(0);
    expect(rt.err()).toContain("Workspace: Acme · Agent: Booking (staging) (77)");
    expect(rt.err()).toContain(`Running 1 scenarios (run ${RUN})`);
    expect(rt.out()).toContain("✓ passed");
    expect(rt.out()).toContain("Reschedule an existing booking");
    expect(rt.out()).toContain("1 passed · 0 failed · 0 inconclusive");
    expect(rt.out()).toContain("https://app.usetuner.ai/simulations?agent=77&run=4821");
  });

  it("sends X-Tuner-Client on every request and the names in the body", async () => {
    const api = happyApi();
    const rt = makeRuntime(api);
    await run(
      rt,
      "sim",
      "run",
      "--tag",
      "smoke",
      "--language",
      "en-US",
      "--profile",
      "Returning customer",
      "--noise",
      "cafe",
    );
    for (const req of api.requests) expect(req.headers["x-tuner-client"]).toBe(`cli/${VERSION}`);
    expect(api.requests[0]!.url.searchParams.get("agent_remote_identifier")).toBe(
      "booking-staging",
    );
    expect(api.calls("POST", SELECT)[0]!.body).toEqual({
      tag: "smoke",
      language: "en-US",
      profile: "Returning customer",
      noise: "cafe",
    });
  });

  it("sends selected_scenario_ids for --scenario, repeated or comma-separated", async () => {
    const api = happyApi();
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--scenario", "311,312", "--scenario", "400")).toBe(0);
    expect(api.calls("POST", SELECT)[0]!.body).toEqual({ selected_scenario_ids: [311, 312, 400] });
  });

  it("exits 1 when the agent failed and names the failed evals", async () => {
    const rt = makeRuntime(happyApi(failedRun()));
    expect(await run(rt, "sim", "run", "--tag", "smoke")).toBe(1);
    expect(rt.out()).toMatch(
      /✗ failed\s+Caller asks for a refund\s+failed evals: Refund policy, Escalation/,
    );
    expect(rt.out()).toContain("1 passed · 1 failed · 0 inconclusive");
  });

  it("exits 0 with a warning on inconclusive, 1 with --fail-on-inconclusive", async () => {
    const rt = makeRuntime(happyApi(inconclusiveRun()));
    expect(await run(rt, "sim", "run", "--tag", "smoke")).toBe(0);
    expect(rt.err()).toContain("Warning: run not conclusive (reason: tuner_error); exiting 0");
    expect(rt.out()).toContain("! not connected");
    const rt2 = makeRuntime(happyApi(inconclusiveRun()));
    expect(await run(rt2, "sim", "run", "--tag", "smoke", "--fail-on-inconclusive")).toBe(1);
  });

  it("treats a run canceled elsewhere like a timeout", async () => {
    const rt = makeRuntime(happyApi(canceledRun()));
    expect(await run(rt, "sim", "run", "--tag", "smoke")).toBe(0);
    expect(rt.err()).toContain("reason: canceled");
    const rt2 = makeRuntime(happyApi(canceledRun()));
    expect(await run(rt2, "sim", "run", "--tag", "smoke", "--fail-on-inconclusive")).toBe(1);
  });

  it("prints each scenario once as its verdict becomes final", async () => {
    vi.useFakeTimers();
    const two = (v1: string, v2: string) => [
      call({ scenario_id: 1, persona: "A", verdict: v1 as never }),
      call({ scenario_id: 2, persona: "B", verdict: v2 as never }),
    ];
    const api = new FakeApi()
      .on("GET", "/api/v1/whoami", json(200, whoami()))
      .on("POST", SELECT, started(2))
      .on(
        "GET",
        GET,
        json(200, pendingRun({ simulation_calls: two("pending", "pending") })),
        json(200, pendingRun({ simulation_calls: two("passed", "pending") })),
        json(200, pendingRun({ simulation_calls: two("passed", "pending") })),
        json(200, makeRun({ simulation_calls: two("passed", "passed") })),
      );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe(0);
    expect(rt.out().match(/✓ passed\s+A/g)).toHaveLength(1);
    expect(rt.out().match(/✓ passed\s+B/g)).toHaveLength(1);
  });
});

describe("sim run: agent resolution", () => {
  it("uses whoami's agent for a remote identifier from --agent", async () => {
    const api = happyApi();
    const rt = makeRuntime(api, { env: { TUNER_AGENT_ID: "other" } });
    await run(rt, "sim", "run", "--tag", "x", "--agent", "booking-staging");
    expect(api.requests[0]!.url.searchParams.get("agent_remote_identifier")).toBe(
      "booking-staging",
    );
  });

  it("looks up a numeric agent ID by path", async () => {
    const api = happyApi()
      .on("GET", "/api/v1/whoami", json(200, whoami(null)))
      .on(
        "GET",
        `/api/v1/workspaces/${WS}/agents/77`,
        json(200, { ...defaultAgent, call_direction: "inbound" }),
      );
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--tag", "x", "--agent", "77")).toBe(0);
    expect(api.requests[0]!.url.search).toBe("");
    expect(api.calls("POST", SELECT)).toHaveLength(1);
  });

  it("exits 2 with no agent", async () => {
    const api = happyApi();
    const rt = makeRuntime(api, { env: { TUNER_AGENT_ID: undefined } });
    expect(await run(rt, "sim", "run", "--tag", "x")).toBe(2);
    expect(rt.err()).toContain("No agent. Pass --agent <agent-remote-id> or set TUNER_AGENT_ID.");
    expect(api.requests).toHaveLength(0);
  });

  it("exits 2 with no API key", async () => {
    const api = happyApi();
    const rt = makeRuntime(api, { env: { TUNER_API_KEY: undefined } });
    expect(await run(rt, "sim", "run", "--tag", "x")).toBe(2);
    expect(rt.err()).toContain("No API key. Set TUNER_API_KEY or run `tuner auth login`.");
  });

  it("exits 2 when TUNER_WORKSPACE_ID differs from the key's workspace", async () => {
    const api = happyApi();
    const rt = makeRuntime(api, { env: { TUNER_WORKSPACE_ID: "99" } });
    expect(await run(rt, "sim", "run", "--tag", "x")).toBe(2);
    expect(rt.err()).toContain("TUNER_WORKSPACE_ID is 99");
    expect(api.calls("POST", SELECT)).toHaveLength(0);
  });

  it("accepts a matching TUNER_WORKSPACE_ID", async () => {
    const rt = makeRuntime(happyApi(), { env: { TUNER_WORKSPACE_ID: String(WS) } });
    expect(await run(rt, "sim", "run", "--tag", "x")).toBe(0);
  });
});

describe("sim run: usage errors exit 2", () => {
  it.each([
    [["sim", "run"], "Pass exactly one of --tag or --scenario."],
    [["sim", "run", "--tag", "a", "--scenario", "1"], "Pass exactly one of --tag or --scenario."],
    [["sim", "run", "--scenario", "abc"], "Invalid scenario ID 'abc'"],
    [["sim", "run", "--tag", "a", "--timeout", "soon"], "Invalid duration 'soon'"],
    [["sim", "run", "--tag", "a", "--base-url", "ftp://x"], "Base URL must be http or https"],
  ])("%j", async (argv, message) => {
    const api = happyApi();
    const rt = makeRuntime(api);
    expect(await run(rt, ...argv)).toBe(2);
    expect(rt.err()).toContain(message);
    expect(api.calls("POST", SELECT)).toHaveLength(0);
  });

  it("rejects an unknown --output", async () => {
    const rt = makeRuntime(happyApi());
    expect(await run(rt, "sim", "run", "--tag", "a", "--output", "xml")).toBe(2);
  });
});

describe("sim run: start errors", () => {
  const cases: [string, number, string, unknown, Record<string, unknown>, string][] = [
    [
      "insufficient_access",
      403,
      "select",
      "Not allowed",
      {},
      "This API key can't access this resource",
    ],
    ["agent_not_found", 404, "select", "Agent not found", {}, "Agent 'booking-staging' not found"],
    ["scenario_not_found", 404, "select", "Scenarios not found: 9", {}, "tuner scenarios list"],
    [
      "no_scenarios_for_tag",
      422,
      "select",
      [
        {
          type: "value_error",
          loc: ["body", "tag"],
          msg: "No scenarios tagged 'smoke'.",
          input: "smoke",
        },
      ],
      {},
      "No scenarios tagged 'smoke'. Run `tuner scenarios list` to see tags.",
    ],
    [
      "run_too_large",
      422,
      "select",
      [
        {
          type: "value_error",
          loc: ["body", "tag"],
          msg: "Run has 34 scenarios; the limit is 20.",
          input: "smoke",
        },
      ],
      {},
      "Run has 34 scenarios; the limit is 20.",
    ],
    [
      "unresolved_name",
      422,
      "select",
      [
        {
          type: "value_error",
          loc: ["body", "noise"],
          msg: "Unknown noise 'cafe2'.",
          input: "cafe2",
        },
      ],
      {},
      "Unknown noise 'cafe2'. Run `tuner noise list`.",
    ],
    [
      "insufficient_credits",
      402,
      "select",
      { code: "no_credits", message: "No credits remaining" },
      {},
      "No credits left for this workspace: No credits remaining",
    ],
    [
      "run_in_flight",
      409,
      "select",
      "You have a simulation run in progress. Come back later.",
      { run_id: 4820, dashboard_url: "https://app.usetuner.ai/simulations?agent=77&run=4820" },
      "tuner runs get 4820",
    ],
    [
      "simulation_not_configured",
      422,
      "select",
      "No PASS_FAIL eval",
      {},
      "The agent isn't set up for simulations: No PASS_FAIL eval",
    ],
    [
      "validation_error",
      422,
      "select",
      [
        {
          type: "value_error",
          loc: ["body", "tag"],
          msg: "Send exactly one of tag or selected_scenario_ids.",
        },
      ],
      {},
      "Send exactly one of tag",
    ],
    ["validation_error", 400, "select", "Invalid caller persona", {}, "Invalid caller persona"],
    ["workspace_not_found", 404, "select", "Workspace not found", {}, "Workspace not found"],
    [
      "invalid_api_key",
      401,
      "whoami",
      "This endpoint requires a Tuner API key.",
      {},
      "API key rejected: This endpoint requires a Tuner API key. (key from TUNER_API_KEY)",
    ],
    [
      "invalid_api_key",
      403,
      "whoami",
      "Invalid API key.",
      {},
      "API key rejected: Invalid API key.",
    ],
    [
      "agent_not_found",
      404,
      "whoami",
      "Agent with remote identifier booking-staging not found",
      {},
      "Agent 'booking-staging' not found",
    ],
  ];

  it.each(cases)("%s (%d at %s) exits 2", async (code, status, where, detail, extra, message) => {
    const api = happyApi();
    if (where === "whoami") api.on("GET", "/api/v1/whoami", apiError(status, code, detail));
    else api.on("POST", SELECT, apiError(status, code, detail, extra));
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--output", "json")).toBe(2);
    expect(rt.err()).toContain(message);
    const doc = JSON.parse(rt.out());
    expect(doc.reason).toBe(code);
    expect(doc.exit_code).toBe(2);
    expect(doc.run).toBeNull();
    expect(doc.error.code).toBe(code);
    if (code === "run_in_flight") expect(doc.error.run_id).toBe(4820);
    if (code === "unresolved_name") expect(doc.error.field).toBe("noise");
    expect(api.calls("GET", GET)).toHaveLength(0);
  });

  it("retries rate_limited at start, then runs", async () => {
    vi.useFakeTimers();
    const api = happyApi().on(
      "POST",
      SELECT,
      apiError(429, "rate_limited", "Too many requests", {}, { "retry-after": "5" }),
      started(),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await p).toBe(0);
    expect(api.calls("POST", SELECT)).toHaveLength(2);
  });

  it.each([
    ["run_start_failed", apiError(503, "run_start_failed", "Could not queue calls")],
    ["internal_error", apiError(500, "internal_error", "Internal Server Error")],
    ["network", networkError()],
  ])(
    "%s at start retries for 5 minutes, then reason tuner_error exit 0 (1 with flag)",
    async (_n, reply) => {
      vi.useFakeTimers();
      for (const [flag, expected] of [
        [[], 0],
        [["--fail-on-inconclusive"], 1],
      ] as const) {
        const api = happyApi().on("POST", SELECT, reply);
        const rt = makeRuntime(api);
        const p = run(rt, "sim", "run", "--tag", "smoke", "--output", "json", ...flag);
        await vi.advanceTimersByTimeAsync(400_000);
        expect(await p).toBe(expected);
        const doc = JSON.parse(rt.out());
        expect(doc.reason).toBe("tuner_error");
        expect(doc.exit_code).toBe(expected);
        expect(api.calls("POST", SELECT).length).toBeGreaterThan(5);
        expect(rt.err()).toContain("retrying in 3s");
      }
    },
  );

  it("whoami 5xx retries too and ends as tuner_error", async () => {
    vi.useFakeTimers();
    const api = happyApi().on(
      "GET",
      "/api/v1/whoami",
      apiError(502, "internal_error", "Bad gateway"),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(400_000);
    expect(await p).toBe(0);
    expect(rt.err()).toContain("Tuner is unavailable");
  });
});

describe("sim run: --no-wait", () => {
  it("prints the run ID and URL and exits 0 without polling", async () => {
    const api = happyApi(pendingRun());
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--no-wait")).toBe(0);
    expect(rt.out()).toBe(`${RUN}\nhttps://app.usetuner.ai/simulations?agent=77&run=${RUN}\n`);
    expect(api.calls("GET", GET)).toHaveLength(1);
    expect(api.calls("POST", CANCEL)).toHaveLength(0);
  });

  it("is never canceled by a signal after it returns", async () => {
    const api = happyApi(pendingRun());
    const rt = makeRuntime(api);
    await run(rt, "sim", "run", "--tag", "smoke", "--no-wait");
    rt.emit("SIGINT");
    expect(api.calls("POST", CANCEL)).toHaveLength(0);
    expect(rt.exits).toEqual([]);
  });
});

describe("sim run: stop paths", () => {
  const stoppable = () => happyApi(pendingRun()).on("POST", CANCEL, json(200, canceledRun()));

  it("--timeout cancels the run and reports reason timeout (exit 0, 1 with flag)", async () => {
    vi.useFakeTimers();
    for (const [flag, expected] of [
      [[], 0],
      [["--fail-on-inconclusive"], 1],
    ] as const) {
      const api = stoppable();
      const rt = makeRuntime(api);
      const p = run(
        rt,
        "sim",
        "run",
        "--tag",
        "smoke",
        "--timeout",
        "90s",
        "--output",
        "json",
        ...flag,
      );
      await vi.advanceTimersByTimeAsync(89_000);
      expect(api.calls("POST", CANCEL)).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await p).toBe(expected);
      expect(api.calls("POST", CANCEL)).toHaveLength(1);
      expect(rt.err()).toContain(`Timeout of 90s reached. Canceling run ${RUN}...`);
      const doc = JSON.parse(rt.out());
      expect(doc.reason).toBe("timeout");
      expect(doc.run.status).toBe("canceled");
      expect(doc.exit_code).toBe(expected);
    }
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("%s cancels the run and exits %d", async (signal, code) => {
    vi.useFakeTimers();
    const api = stoppable();
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(4_000);
    rt.emit(signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(code);
    expect(api.calls("POST", CANCEL)).toHaveLength(1);
    expect(rt.err()).toContain(`Canceling run ${RUN}...`);
    expect(rt.out()).toContain("- canceled");
  });

  it("waits up to 10 s for a terminal state after cancel", async () => {
    vi.useFakeTimers();
    const api = happyApi(pendingRun()).on("POST", CANCEL, json(200, pendingRun()));
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(1_000);
    rt.emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(9_000);
    let done = false;
    void p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p).toBe(143);
    expect(rt.err()).toContain("did not reach a final state within 10s");
  });

  it("a second signal exits at once", async () => {
    vi.useFakeTimers();
    const api = happyApi(pendingRun()).on("POST", CANCEL, () => new Promise<Response>(() => {}));
    const rt = makeRuntime(api);
    void run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(1_000);
    rt.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(0);
    expect(() => rt.emit("SIGINT")).toThrow(ExitCalled);
    expect(rt.exits).toEqual([130]);
    expect(rt.err()).toContain(`Run ${RUN} may still be going`);
  });

  it("prints that analysis continues when cancel returns analyzing", async () => {
    vi.useFakeTimers();
    const api = happyApi(pendingRun()).on(
      "POST",
      CANCEL,
      json(200, pendingRun({ status: "analyzing" })),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(1_000);
    rt.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(130);
    expect(rt.err()).toContain(
      `Run ${RUN} is analyzing: its calls are done and analysis continues.`,
    );
    expect(rt.out()).toContain("https://app.usetuner.ai/simulations?agent=77&run=4821");
    expect(api.calls("GET", GET)).toHaveLength(1);
  });

  it("a signal during the start request cancels the run it created", async () => {
    vi.useFakeTimers();
    let release: (r: Response) => void = () => {};
    const api = happyApi(pendingRun())
      .on("POST", SELECT, () => new Promise<Response>((resolve) => (release = resolve)))
      .on("POST", CANCEL, json(200, canceledRun()));
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(0);
    rt.emit("SIGINT");
    release(started());
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe(130);
    expect(api.calls("POST", CANCEL)).toHaveLength(1);
  });

  it("a signal before the run starts exits without a cancel", async () => {
    vi.useFakeTimers();
    const api = happyApi().on("GET", "/api/v1/whoami", networkError());
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke");
    await vi.advanceTimersByTimeAsync(1_000);
    rt.emit("SIGTERM");
    expect(await p).toBe(143);
    expect(api.calls("POST", SELECT)).toHaveLength(0);
  });

  it("gives up after 5 minutes of poll failures with reason tuner_error and the run ID", async () => {
    vi.useFakeTimers();
    const api = happyApi().on(
      "GET",
      GET,
      json(200, pendingRun()),
      apiError(503, "internal_error", "down"),
    );
    const rt = makeRuntime(api);
    const p = run(rt, "sim", "run", "--tag", "smoke", "--output", "json");
    await vi.advanceTimersByTimeAsync(400_000);
    expect(await p).toBe(0);
    expect(rt.err()).toContain(`Tuner unreachable for 5 minutes`);
    expect(rt.err()).toContain(`tuner runs get ${RUN}`);
    expect(JSON.parse(rt.out()).reason).toBe("tuner_error");
    expect(api.calls("POST", CANCEL)).toHaveLength(0);
  });

  it("a non-retryable poll error stops with tuner_error", async () => {
    const api = happyApi().on("GET", GET, apiError(404, "run_not_found", "Run not found"));
    const rt = makeRuntime(api);
    expect(await run(rt, "sim", "run", "--tag", "smoke", "--fail-on-inconclusive")).toBe(1);
    expect(rt.err()).toContain("Could not read run 4821: Run not found");
  });
});
