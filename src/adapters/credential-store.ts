import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "../domain/errors.js";
import type { CredentialStore } from "../ports.js";

const CREDENTIALS_FILE = "credentials.json";

const why = (err: unknown) =>
  (err as { code?: string }).code ?? (err instanceof Error ? err.message : String(err));

/** The API key in `<configDir>/credentials.json`, mode 0600. */
export class FileCredentialStore implements CredentialStore {
  readonly path: string;

  constructor(private readonly configDir: string) {
    this.path = join(configDir, CREDENTIALS_FILE);
  }

  async read(): Promise<string | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return undefined;
      throw this.unreadable(why(err));
    }
    let parsed: { api_key?: unknown };
    try {
      parsed = JSON.parse(raw) as { api_key?: unknown };
    } catch {
      throw this.unreadable("not valid JSON");
    }
    return typeof parsed?.api_key === "string" && parsed.api_key ? parsed.api_key : undefined;
  }

  async write(apiKey: string): Promise<string> {
    try {
      await mkdir(this.configDir, { recursive: true, mode: 0o700 });
      await writeFile(this.path, JSON.stringify({ api_key: apiKey }, null, 2) + "\n", {
        mode: 0o600,
      });
      // writeFile keeps the mode of an existing file.
      await chmod(this.path, 0o600);
    } catch (err) {
      throw new CliError(`Can't save the API key to ${this.path} (${why(err)}).`, "config_error");
    }
    return this.path;
  }

  async delete(): Promise<boolean> {
    try {
      await readFile(this.path);
    } catch {
      return false;
    }
    try {
      await rm(this.path, { force: true });
    } catch (err) {
      throw new CliError(`Can't remove ${this.path} (${why(err)}).`, "config_error");
    }
    return true;
  }

  private unreadable(reason: string): CliError {
    return new CliError(
      `Can't read the stored API key at ${this.path} (${reason}). ` +
        "Run `tuner auth login` again, or set TUNER_API_KEY.",
      "config_error",
    );
  }
}
