import type { AppDeps, TunerApi } from "../../src/ports.js";
import { FakeClock } from "./clock.js";
import { FakeCredentialStore } from "./credential-store.js";
import { FakeOutput } from "./output.js";
import { FakeSignals } from "./signals.js";
import { FakeTunerApi } from "./tuner-api.js";

/** All ports faked; `connected` records each `connect(baseUrl, apiKey)`. */
export function fakeDeps(
  stubs: Partial<TunerApi> = {},
  env: Record<string, string | undefined> = { TUNER_API_KEY: "tr_api_test" },
) {
  const api = new FakeTunerApi(stubs);
  const connected: [string, string][] = [];
  const deps = {
    env,
    clock: new FakeClock(),
    credentials: new FakeCredentialStore(),
    connect: (baseUrl: string, apiKey: string) => {
      connected.push([baseUrl, apiKey]);
      return api;
    },
    signals: new FakeSignals(),
    output: new FakeOutput(),
  } satisfies AppDeps & Record<string, unknown>;
  return { ...deps, deps, api, connected };
}
