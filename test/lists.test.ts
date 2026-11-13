import { describe, expect, it } from "vitest";
import { AGENT_PATH, FakeApi, WS, apiError, json, makeRuntime, run, whoami } from "./helpers.js";

const WS_PATH = `/api/v1/workspaces/${WS}`;
const base = () => new FakeApi().on("GET", "/api/v1/whoami", json(200, whoami()));

const scenario = { id: 311, name: "Refund request", type: "routine", tags: ["smoke", "billing"] };
const persona = { id: 1, name: "English (American)", code: "en-US" };

describe("list commands", () => {
  it("agents list shows the Agent ID", async () => {
    const api = base().on(
      "GET",
      `${WS_PATH}/agents/`,
      json(200, [
        {
          id: 77,
          remote_identifier: "booking-staging",
          name: "Booking",
          call_direction: "inbound",
        },
      ]),
    );
    const rt = makeRuntime(api, { env: { TUNER_AGENT_ID: undefined } });
    expect(await run(rt, "agents", "list")).toBe(0);
    expect(rt.out()).toMatch(/ID\s+AGENT ID\s+NAME\s+DIRECTION/);
    expect(rt.out()).toMatch(/77\s+booking-staging\s+Booking\s+inbound/);
  });

  it("scenarios list passes --tag and needs an agent", async () => {
    const api = base().on("GET", `${AGENT_PATH}/scenarios`, json(200, { scenarios: [scenario] }));
    const rt = makeRuntime(api);
    expect(await run(rt, "scenarios", "list", "--tag", "smoke")).toBe(0);
    expect(api.calls("GET", `${AGENT_PATH}/scenarios`)[0]!.url.searchParams.get("tag")).toBe(
      "smoke",
    );
    expect(rt.out()).toMatch(/311\s+Refund request\s+routine\s+smoke, billing/);
    const rt2 = makeRuntime(base(), { env: { TUNER_AGENT_ID: undefined } });
    expect(await run(rt2, "scenarios", "list")).toBe(2);
  });

  it("languages list shows codes", async () => {
    const api = base().on(
      "GET",
      `${WS_PATH}/caller-personas`,
      json(200, { personas: [persona], supported: [] }),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "languages", "list")).toBe(0);
    expect(rt.out()).toMatch(/en-US\s+English \(American\)/);
  });

  it("noise list shows slugs", async () => {
    const api = base().on(
      "GET",
      `${WS_PATH}/noise-environments`,
      json(200, { environments: [{ id: 2, name: "Café", slug: "cafe" }] }),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "noise", "list")).toBe(0);
    expect(rt.out()).toMatch(/cafe\s+Café/);
  });

  it("profiles list uses --agent", async () => {
    const api = base().on(
      "GET",
      `${AGENT_PATH}/simulation-profiles`,
      json(200, { simulation_profiles: [{ id: 5, name: "Returning customer" }] }),
    );
    const rt = makeRuntime(api, { env: { TUNER_AGENT_ID: undefined } });
    expect(await run(rt, "profiles", "list", "--agent", "booking-staging")).toBe(0);
    expect(rt.out()).toMatch(/5\s+Returning customer/);
  });

  it("prints JSON with schema_version", async () => {
    const api = base().on(
      "GET",
      `${WS_PATH}/noise-environments`,
      json(200, { environments: [{ id: 2, name: "Café", slug: "cafe" }] }),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "noise", "list", "--output", "json")).toBe(0);
    expect(JSON.parse(rt.out())).toEqual({
      schema_version: 1,
      noise_environments: [{ id: 2, name: "Café", slug: "cafe" }],
    });
  });

  it("prints a note when empty", async () => {
    const api = base().on("GET", `${AGENT_PATH}/scenarios`, json(200, { scenarios: [] }));
    const rt = makeRuntime(api);
    expect(await run(rt, "scenarios", "list")).toBe(0);
    expect(rt.err()).toContain("No scenarios found.");
  });

  it("exits 2 on an API error", async () => {
    const api = base().on(
      "GET",
      `${WS_PATH}/caller-personas`,
      apiError(403, "insufficient_access", "No access"),
    );
    const rt = makeRuntime(api);
    expect(await run(rt, "languages", "list")).toBe(2);
    expect(rt.err()).toContain("No access");
  });
});
