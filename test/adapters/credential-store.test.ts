import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileCredentialStore } from "../../src/adapters/credential-store.js";

const store = () =>
  new FileCredentialStore(join(mkdtempSync(join(tmpdir(), "tuner-cs-")), "tuner"));

describe("FileCredentialStore", () => {
  it("writes the credentials file with 0600", async () => {
    const s = store();
    const path = await s.write("tr_api_x");
    expect(path).toBe(s.path);
    expect(path.endsWith("credentials.json")).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(await s.read()).toBe("tr_api_x");
  });

  it("tightens an existing file to 0600", async () => {
    const s = store();
    await s.write("a");
    writeFileSync(s.path, "{}", { mode: 0o644 });
    await s.write("b");
    expect(statSync(s.path).mode & 0o777).toBe(0o600);
  });

  it("reads nothing from a missing, broken or empty file", async () => {
    const s = store();
    expect(await s.read()).toBeUndefined();
    await s.write("x");
    writeFileSync(s.path, "not json");
    expect(await s.read()).toBeUndefined();
    writeFileSync(s.path, JSON.stringify({ api_key: "" }));
    expect(await s.read()).toBeUndefined();
  });

  it("deletes the stored key once", async () => {
    const s = store();
    expect(await s.delete()).toBe(false);
    await s.write("x");
    expect(await s.delete()).toBe(true);
    expect(await s.read()).toBeUndefined();
  });
});
