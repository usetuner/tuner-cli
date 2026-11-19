import { chmodSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
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

  it("reads nothing from a missing or empty file", async () => {
    const s = store();
    expect(await s.read()).toBeUndefined();
    await s.write("x");
    writeFileSync(s.path, JSON.stringify({ api_key: "" }));
    expect(await s.read()).toBeUndefined();
  });

  it("names a broken or unreadable file instead of saying there is no key", async () => {
    const s = store();
    await s.write("x");
    writeFileSync(s.path, "not json");
    await expect(s.read()).rejects.toMatchObject({
      reason: "config_error",
      exitCode: 2,
      message: `Can't read the stored API key at ${s.path} (not valid JSON). Run \`tuner auth login\` again, or set TUNER_API_KEY.`,
    });
    chmodSync(s.path, 0o000);
    await expect(s.read()).rejects.toThrow(`at ${s.path} (EACCES)`);
  });

  it("exits 2 when the key can't be saved or removed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tuner-cs-"));
    const s = new FileCredentialStore(join(dir, "tuner"));
    await s.write("x");
    chmodSync(s.path, 0o400);
    await expect(s.write("y")).rejects.toMatchObject({
      reason: "config_error",
      exitCode: 2,
      message: `Can't save the API key to ${s.path} (EACCES).`,
    });
    chmodSync(join(dir, "tuner"), 0o500);
    try {
      await expect(s.delete()).rejects.toThrow(`Can't remove ${s.path} (EACCES).`);
    } finally {
      chmodSync(join(dir, "tuner"), 0o700);
    }
  });

  it("deletes the stored key once", async () => {
    const s = store();
    expect(await s.delete()).toBe(false);
    await s.write("x");
    expect(await s.delete()).toBe(true);
    expect(await s.read()).toBeUndefined();
  });
});
