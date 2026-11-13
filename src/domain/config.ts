import { CliError } from "./errors.js";

export const DEFAULT_BASE_URL = "https://api.usetuner.ai";

export interface GlobalFlags {
  apiKey?: string;
  baseUrl?: string;
  verbose?: boolean;
}

export type KeySource = "flag" | "env" | "stored";

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

export type Env = Record<string, string | undefined>;

export function resolveBaseUrl(flags: GlobalFlags, ctx: { env: Env }): string {
  const raw = flags.baseUrl || ctx.env.TUNER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError(`Invalid base URL '${raw}'.`, "usage_error");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(`Base URL must be http or https, got '${raw}'.`, "usage_error");
  }
  return raw.replace(/\/+$/, "");
}

export function resolveAgentRef(
  flagAgent: string | undefined,
  ctx: { env: Env },
): string | undefined {
  const value = flagAgent?.trim() || ctx.env.TUNER_AGENT_ID?.trim();
  return value || undefined;
}
