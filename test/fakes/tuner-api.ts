import type { TunerApi } from "../../src/ports.js";

type Method = keyof TunerApi;

/** In-memory `TunerApi`: stub the methods a test needs; the rest reject. */
export class FakeTunerApi implements TunerApi {
  readonly calls: { method: Method; args: unknown[] }[] = [];

  constructor(private readonly stubs: Partial<TunerApi> = {}) {}

  called(method: Method): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }

  private invoke<M extends Method>(method: M, args: unknown[]): ReturnType<TunerApi[M]> {
    this.calls.push({ method, args });
    const stub = this.stubs[method] as ((...a: unknown[]) => ReturnType<TunerApi[M]>) | undefined;
    if (!stub) return Promise.reject(new Error(`FakeTunerApi.${method} not stubbed`)) as never;
    return stub(...args);
  }

  whoami: TunerApi["whoami"] = (...a) => this.invoke("whoami", a);
  getAgent: TunerApi["getAgent"] = (...a) => this.invoke("getAgent", a);
  listAgents: TunerApi["listAgents"] = (...a) => this.invoke("listAgents", a);
  startRun: TunerApi["startRun"] = (...a) => this.invoke("startRun", a);
  searchRuns: TunerApi["searchRuns"] = (...a) => this.invoke("searchRuns", a);
  getRun: TunerApi["getRun"] = (...a) => this.invoke("getRun", a);
  cancelRun: TunerApi["cancelRun"] = (...a) => this.invoke("cancelRun", a);
  listScenarios: TunerApi["listScenarios"] = (...a) => this.invoke("listScenarios", a);
  listCallerPersonas: TunerApi["listCallerPersonas"] = (...a) =>
    this.invoke("listCallerPersonas", a);
  listNoiseEnvironments: TunerApi["listNoiseEnvironments"] = (...a) =>
    this.invoke("listNoiseEnvironments", a);
  listProfiles: TunerApi["listProfiles"] = (...a) => this.invoke("listProfiles", a);
}
