import { exitForError } from "./exit.js";

/** A failure the CLI reports and exits on. `reason` goes in the JSON document. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly exitCode: number = exitForError(reason),
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** A non-2xx response from the Tuner API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: unknown,
    readonly body: Record<string, unknown>,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(`${status} ${code}: ${detailText(detail)}`);
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** The request never got a response (DNS, refused, reset, timeout). */
export class NetworkError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
  }
}

/** A response the CLI can't read: a 2xx whose body is empty or not JSON. Not retried. */
export class UnexpectedResponseError extends Error {}

/** Retries ran out after 5 minutes (or the command's budget) of consecutive failures. */
export class GaveUpError extends Error {
  constructor(readonly lastError: ApiError | NetworkError) {
    super(lastError.message);
  }
}

export function isRetryable(err: unknown): err is ApiError | NetworkError {
  return (err instanceof ApiError || err instanceof NetworkError) && err.retryable;
}

/** Text for any `detail` shape: string, 422 list, or billing object. */
export function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item ? String(item.msg) : JSON.stringify(item),
      )
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    return JSON.stringify(detail);
  }
  return detail === undefined || detail === null ? "" : String(detail);
}
