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
