import type { Stream } from "../ports.js";

/** Writes one JSON document to stdout. */
export function writeJson(stream: Stream, value: unknown): void {
  stream.write(JSON.stringify(value, null, 2) + "\n");
}
