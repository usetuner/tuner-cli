import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CredentialStore } from "../ports.js";

const CREDENTIALS_FILE = "credentials.json";

/** The API key in `<configDir>/credentials.json`, mode 0600. */
export class FileCredentialStore implements CredentialStore {
  readonly path: string;

  constructor(private readonly configDir: string) {
    this.path = join(configDir, CREDENTIALS_FILE);
  }

  async read(): Promise<string | undefined> {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as { api_key?: unknown };
      return typeof parsed.api_key === "string" && parsed.api_key ? parsed.api_key : undefined;
    } catch {
      return undefined;
    }
  }

  async write(apiKey: string): Promise<string> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    await writeFile(this.path, JSON.stringify({ api_key: apiKey }, null, 2) + "\n", {
      mode: 0o600,
    });
    // writeFile keeps the mode of an existing file.
    await chmod(this.path, 0o600);
    return this.path;
  }

  async delete(): Promise<boolean> {
    try {
      await readFile(this.path);
    } catch {
      return false;
    }
    await rm(this.path, { force: true });
    return true;
  }
}
