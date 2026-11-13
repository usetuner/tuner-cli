import { FileCredentialStore } from "../adapters/credential-store.js";
import { TunerClient } from "../adapters/http-client.js";
import type { GlobalFlags } from "../domain/config.js";
import type { AppDeps, Runtime } from "../ports.js";

/** Wires the adapters behind the ports for one command. */
export function makeDeps(runtime: Runtime, flags: GlobalFlags): AppDeps {
  return {
    env: runtime.env,
    clock: runtime,
    credentials: new FileCredentialStore(runtime.configDir),
    connect: (baseUrl, apiKey) =>
      new TunerClient({ baseUrl, apiKey, runtime, verbose: flags.verbose }),
  };
}
