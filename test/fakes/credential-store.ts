import type { CredentialStore } from "../../src/ports.js";

/** In-memory `CredentialStore`. */
export class FakeCredentialStore implements CredentialStore {
  readonly path = "/fake/tuner/credentials.json";

  constructor(public key?: string) {}

  read(): Promise<string | undefined> {
    return Promise.resolve(this.key);
  }

  write(apiKey: string): Promise<string> {
    this.key = apiKey;
    return Promise.resolve(this.path);
  }

  delete(): Promise<boolean> {
    const had = this.key !== undefined;
    this.key = undefined;
    return Promise.resolve(had);
  }
}
