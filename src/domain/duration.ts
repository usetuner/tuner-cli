/** Parses `90s`, `30m`, `1h30m` or plain seconds into milliseconds. */
export function parseDuration(input: string): number {
  const text = input.trim();
  if (/^\d+$/.test(text)) return positive(Number(text) * 1000, input);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || text === "") throw new Error(`Invalid duration '${input}'. Use e.g. 90s, 30m, 1h.`);
  const [, h = "0", m = "0", s = "0"] = match;
  return positive((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000, input);
}

function positive(ms: number, input: string): number {
  if (ms <= 0) throw new Error(`Duration '${input}' must be greater than zero.`);
  return ms;
}

/** Formats milliseconds as `1h2m3s`, dropping zero parts (`90s` -> `1m30s`). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = `${h ? `${h}h` : ""}${m ? `${m}m` : ""}${s ? `${s}s` : ""}`;
  return text || "0s";
}
