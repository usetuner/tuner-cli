import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "../../src/domain/config.js";
import { startOutcomeUnknown, toCliError } from "../../src/domain/error-message.js";
import {
  ApiError,
  CliError,
  GaveUpError,
  NetworkError,
  UnexpectedResponseError,
} from "../../src/domain/errors.js";
import { EXIT_FOR_CODE, exitForRun, exitForTimeout } from "../../src/domain/exit.js";
import { buildStartBody, parseRunId, parseTimeout } from "../../src/domain/inputs.js";
import { runEndMessage } from "../../src/domain/run-end.js";

const api = (status: number, code: string, detail: unknown, body: Record<string, unknown> = {}) =>
  new ApiError(status, code, detail, body, undefined);
const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("did not throw");
};

/** Every way a command can stop on an error: [path, error, context, exit, code, message]. */
const ERROR_PATHS: [string, unknown, Parameters<typeof toCliError>[1], number, string, string][] = [
  // CLI-local usage errors
  [
    "both --tag and --scenario",
    thrown(() => buildStartBody({ tag: "a", scenario: ["1"] })),
    {},
    2,
    "usage_error",
    "Pass exactly one of --tag, --scenario or --suite.",
  ],
  [
    "--suite with another selector or setting",
    thrown(() => buildStartBody({ suite: "smoke", tag: "a" })),
    {},
    2,
    "usage_error",
    "--suite can't be combined with --tag.",
  ],
  [
    "bad scenario ID",
    thrown(() => buildStartBody({ scenario: ["x"] })),
    {},
    2,
    "usage_error",
    "Invalid scenario ID 'x'",
  ],
  [
    "--noise-intensity without --noise",
    thrown(() => buildStartBody({ tag: "a", noiseIntensity: "high" })),
    {},
    2,
    "usage_error",
    "--noise-intensity needs --noise <slug>.",
  ],
  ["bad run ID", thrown(() => parseRunId("abc")), {}, 2, "usage_error", "Invalid run ID 'abc'"],
  [
    "bad --timeout",
    thrown(() => parseTimeout("5x")),
    {},
    2,
    "usage_error",
    "Invalid duration '5x'",
  ],
  [
    "base URL not http(s)",
    thrown(() => resolveBaseUrl({ baseUrl: "ftp://x" }, { env: {} })),
    {},
    2,
    "usage_error",
    "Base URL must be http or https",
  ],
  [
    "base URL unparsable",
    thrown(() => resolveBaseUrl({ baseUrl: "nope" }, { env: {} })),
    {},
    2,
    "usage_error",
    "Invalid base URL 'nope'.",
  ],
  // API codes
  [
    "invalid_api_key 401",
    api(401, "invalid_api_key", "Not authenticated"),
    { keySource: "TUNER_API_KEY" },
    2,
    "invalid_api_key",
    "API key rejected (Not authenticated); key from TUNER_API_KEY. Set a valid key in TUNER_API_KEY or run `tuner auth login`.",
  ],
  [
    "invalid_api_key 403 (revoked)",
    api(403, "invalid_api_key", "Invalid API key."),
    {},
    2,
    "invalid_api_key",
    "API key rejected (Invalid API key). Set a valid key",
  ],
  [
    "insufficient_access",
    api(403, "insufficient_access", "Agent 5 does not belong to workspace 73"),
    {},
    2,
    "insufficient_access",
    "This API key can't access it: Agent 5 does not belong to workspace 73. Use a key from the agent's workspace.",
  ],
  [
    "workspace_not_found",
    api(404, "workspace_not_found", "Workspace with ID 42 not found"),
    {},
    2,
    "workspace_not_found",
    "Workspace with ID 42 not found. Check the key's workspace with `tuner auth status`.",
  ],
  [
    "agent_not_found with --agent",
    api(404, "agent_not_found", "nf"),
    { agentRef: "a1" },
    2,
    "agent_not_found",
    "Agent 'a1' not found in this workspace. Run `tuner agents list` to see agent IDs.",
  ],
  [
    "agent_not_found without context",
    api(404, "agent_not_found", "Agent with ID 9 not found"),
    {},
    2,
    "agent_not_found",
    "Agent with ID 9 not found. Run `tuner agents list`",
  ],
  [
    "scenario_not_found",
    api(404, "scenario_not_found", "Scenario 501 not found for this agent."),
    {},
    2,
    "scenario_not_found",
    "Scenario 501 not found for this agent. Run `tuner scenarios list` to see scenario IDs.",
  ],
  [
    "unknown suite name",
    api(422, "unresolved_name", [
      { type: "value_error", loc: ["body", "suite"], msg: "Unknown suite: smoke", input: "smoke" },
    ]),
    {},
    2,
    "unresolved_name",
    "Unknown suite: smoke. Run `tuner suites list`.",
  ],
  [
    "suite_has_no_scenarios",
    api(
      422,
      "suite_has_no_scenarios",
      "Suite 'Smoke' has no scenarios. Add at least one before running it.",
    ),
    {},
    2,
    "suite_has_no_scenarios",
    "Suite 'Smoke' has no scenarios. Add at least one before running it.",
  ],
  [
    "suite_profile_deleted",
    api(422, "suite_profile_deleted", "The test profile of suite 'Smoke' was deleted."),
    {},
    2,
    "suite_profile_deleted",
    "The test profile of suite 'Smoke' was deleted.",
  ],
  [
    "run_not_found",
    api(404, "run_not_found", "Simulation run with ID 9 not found"),
    { runId: 9 },
    2,
    "run_not_found",
    "Run 9 not found for this agent. Check the run ID and --agent.",
  ],
  [
    "no_scenarios_for_tag",
    api(422, "no_scenarios_for_tag", [{ loc: ["body", "tag"], msg: "No scenarios tagged 't'." }]),
    { tag: "t" },
    2,
    "no_scenarios_for_tag",
    "No scenarios tagged 't'. Run `tuner scenarios list` to see tags.",
  ],
  [
    "run_too_large",
    api(422, "run_too_large", [{ msg: "Run has 120 scenarios; the limit is 100." }]),
    {},
    2,
    "run_too_large",
    "Run has 120 scenarios; the limit is 100. Split it into smaller tags or scenario lists.",
  ],
  [
    "unresolved_name",
    api(422, "unresolved_name", [
      { loc: ["body", "noise"], msg: "Unknown noise 'cafe2'.", input: "cafe2" },
    ]),
    {},
    2,
    "unresolved_name",
    "Unknown noise 'cafe2'. Run `tuner noise list`.",
  ],
  [
    "insufficient_credits (no credits)",
    api(402, "insufficient_credits", "You have no credits remaining."),
    {},
    2,
    "insufficient_credits",
    "Not enough credits to start this run (You have no credits remaining). Add credits",
  ],
  [
    "insufficient_credits (plan, billing object)",
    api(402, "insufficient_credits", { code: "x", message: "Simulation not in plan." }),
    {},
    2,
    "insufficient_credits",
    "Not enough credits to start this run (Simulation not in plan).",
  ],
  [
    "run_in_flight (agent busy)",
    api(409, "run_in_flight", "busy", { run_id: 7, dashboard_url: "https://u" }),
    { agentName: "Booking" },
    2,
    "run_in_flight",
    "Agent 'Booking' already has a run in progress (7). Wait for it to finish, then try again. https://u\nCheck it with `tuner runs get 7`.",
  ],
  [
    "run_in_flight without a run ID",
    api(409, "run_in_flight", "busy"),
    {},
    2,
    "run_in_flight",
    "The agent already has a run in progress. Wait for it to finish, then try again.",
  ],
  [
    "simulation_not_configured (incl. SIP unreachable at start)",
    api(422, "simulation_not_configured", "Agent has no boolean (PASS_FAIL) evals."),
    {},
    2,
    "simulation_not_configured",
    "The agent isn't set up for simulations: Agent has no boolean (PASS_FAIL) evals. Fix it",
  ],
  [
    "validation_error 422",
    api(422, "validation_error", [{ msg: "Send exactly one of tag or selected_scenario_ids." }]),
    {},
    2,
    "validation_error",
    "Tuner rejected the request (422): Send exactly one of tag or selected_scenario_ids.",
  ],
  [
    "validation_error 400 (unmapped 4xx, HTML from a proxy)",
    api(400, "validation_error", "400 Bad Request from https://x"),
    {},
    2,
    "validation_error",
    "Tuner rejected the request (400): 400 Bad Request from https://x.",
  ],
  [
    "unknown 4xx code",
    api(418, "teapot", "short and stout"),
    {},
    2,
    "teapot",
    "short and stout (418 teapot).",
  ],
  [
    "unknown 5xx code",
    api(507, "disk_full", ""),
    {},
    3,
    "disk_full",
    "No details (507 disk_full).",
  ],
  [
    "rate_limited without retries",
    api(429, "rate_limited", "Too many requests"),
    {},
    3,
    "rate_limited",
    "Tuner is rate limiting requests (Too many requests). Try again in a minute.",
  ],
  [
    "run_start_failed",
    api(503, "run_start_failed", "Could not start the simulation run. Please try again."),
    {},
    3,
    "run_start_failed",
    "Tuner couldn't start the run: Could not start the simulation run. Please try again.",
  ],
  [
    "internal_error 500",
    api(500, "internal_error", "Internal Server Error"),
    {},
    3,
    "internal_error",
    "Tuner had an internal error (500): Internal Server Error.",
  ],
  [
    "a known 4xx code on a 5xx status",
    api(502, "validation_error", "Bad gateway"),
    {},
    3,
    "validation_error",
    "Tuner rejected the request (502)",
  ],
  // The start was sent but no answer came back: never retried, never adopted
  [
    "start outcome unknown, a run in flight",
    startOutcomeUnknown("Request to https://x timed out after 30s", 4830),
    {},
    3,
    "start_outcome_unknown",
    "Run 4830 is in progress for this agent and may be the one this command started. Check it with `tuner runs get 4830`, or cancel it with `tuner runs cancel 4830`.",
  ],
  [
    "start outcome unknown, nothing in flight",
    startOutcomeUnknown("Could not reach https://x (ECONNRESET)", null),
    {},
    3,
    "start_outcome_unknown",
    "No run is in progress for this agent, so it most likely did not start. Try again.",
  ],
  [
    "start outcome unknown, lookup failed",
    startOutcomeUnknown("Could not reach https://x (ECONNRESET)", undefined),
    {},
    3,
    "start_outcome_unknown",
    "Check the agent's runs in the dashboard before you try again.",
  ],
  // No usable response
  [
    "network error, not retried",
    new NetworkError("Could not reach https://x (ENOTFOUND)"),
    {},
    3,
    "tuner_error",
    "Could not reach https://x (ENOTFOUND). Check your network and --base-url (or TUNER_BASE_URL).",
  ],
  [
    "network error after retries",
    new GaveUpError(new NetworkError("Could not reach https://x (ECONNREFUSED)")),
    {},
    3,
    "tuner_error",
    "Could not reach https://x (ECONNREFUSED), and retries ran out. Check your network",
  ],
  [
    "5xx after retries",
    new GaveUpError(api(502, "internal_error", "Bad gateway")),
    {},
    3,
    "tuner_error",
    "Tuner kept failing (502 internal_error), and retries ran out. Try again later.",
  ],
  [
    "429 after retries",
    new GaveUpError(api(429, "rate_limited", "slow")),
    {},
    3,
    "tuner_error",
    "Tuner kept rate limiting requests (429 rate_limited), and retries ran out.",
  ],
  [
    "2xx that is not JSON",
    new UnexpectedResponseError("Tuner sent a response this CLI can't read"),
    {},
    3,
    "unexpected_response",
    "Tuner sent a response this CLI can't read",
  ],
  [
    "unexpected crash",
    new TypeError("x is undefined"),
    {},
    3,
    "tuner_error",
    "Unexpected error: x is undefined. Re-run with --verbose and report it.",
  ],
  ["non-Error throw", "raw", {}, 3, "tuner_error", "Unexpected error: raw."],
];

describe("error paths", () => {
  it.each(ERROR_PATHS)("%s", (_path, err, ctx, exit, code, message) => {
    const cli = toCliError(err, ctx);
    expect(cli.exitCode).toBe(exit);
    expect(cli.reason).toBe(code);
    expect(cli.message).toContain(message);
  });

  it("gives each customer-facing message its own text", () => {
    const messages = ERROR_PATHS.map(([, err, ctx]) => toCliError(err, ctx).message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("covers every code in the exit table", () => {
    const codes = new Set(ERROR_PATHS.map(([, err, ctx]) => toCliError(err, ctx).reason));
    for (const code of Object.keys(EXIT_FOR_CODE)) {
      if (code === "config_error") continue; // raised in app/, see the CLI-local rows in docs
      expect(codes).toContain(code);
    }
  });

  it("passes a CliError through and keeps the unresolved field", () => {
    const err = new CliError("x", "config_error");
    expect(toCliError(err)).toBe(err);
    expect(toCliError(api(422, "unresolved_name", "plain")).extra).toEqual({
      field: undefined,
      value: undefined,
    });
  });
});

/** Every way a started run can end: [path, result, reason, exit, message]. */
const RUN_ENDS: [string, string | null, string | null, number, string | undefined][] = [
  ["every scenario passed", "passed", null, 0, undefined],
  ["a scenario failed its evals", "failed", "agent_failed", 1, "Result: failed (agent_failed)"],
  [
    "Tuner couldn't finish (not connected, platform error, unreported, analysis failed)",
    "inconclusive",
    "tuner_error",
    3,
    "Tuner couldn't finish this run (tuner_error).",
  ],
  [
    "canceled outside this command",
    "canceled",
    "canceled",
    3,
    "Run 9 was canceled outside this command (the dashboard or `tuner runs cancel`).",
  ],
  [
    "terminal but still pending",
    "pending",
    null,
    3,
    "Tuner couldn't finish this run (tuner_error).",
  ],
  [
    "unknown result",
    "exploded",
    null,
    3,
    "Tuner returned a result this CLI doesn't know (result: exploded, reason: null). Upgrade tuner-cli.",
  ],
  [
    "unknown reason",
    "inconclusive",
    "solar_flare",
    3,
    "Tuner returned a result this CLI doesn't know (result: inconclusive, reason: solar_flare).",
  ],
];

describe("run ends", () => {
  it.each(RUN_ENDS)("%s", (_path, result, reason, exit, message) => {
    expect(exitForRun(result as never, reason as never)).toBe(exit);
    const line = runEndMessage(9, result, reason);
    if (message === undefined) expect(line).toBeUndefined();
    else expect(line).toContain(message);
  });

  it.each([
    ["timeout, nothing failed yet", null, null, 3],
    ["timeout after the server said failed", "failed", "agent_failed", 1],
  ] as const)("%s", (_path, result, reason, exit) => {
    expect(exitForTimeout(result, reason)).toBe(exit);
  });
});
