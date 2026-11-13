#!/usr/bin/env node
// Downloads the public OpenAPI schema, sorts its keys and writes openapi/openapi.json.
// With --check it compares instead of writing, prints what changed and exits 1 on drift.
import { readFile, writeFile, appendFile } from "node:fs/promises";
import process from "node:process";

const DEFAULT_BASE_URL = "https://voice-api.staging.ginni.ai";
const OUT = new URL("../openapi/openapi.json", import.meta.url);
const TIMEOUT_MS = 30_000;

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
};

const serialize = (spec) => `${JSON.stringify(sortKeys(spec), null, 2)}\n`;

async function download(baseUrl) {
  const url = `${baseUrl.replace(/\/+$/, "")}/public/openapi.json`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const cause = err?.cause?.message ?? err?.cause?.code ?? err?.message ?? String(err);
    throw new Error(`GET ${url} failed: ${cause}`);
  }
  if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`);
  let spec;
  try {
    spec = JSON.parse(await res.text());
  } catch {
    throw new Error(`GET ${url} did not return JSON`);
  }
  const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  const badComponents = spec?.components !== undefined && !isObject(spec.components);
  if (typeof spec?.openapi !== "string" || !isObject(spec.paths) || badComponents) {
    throw new Error(`GET ${url} did not return an OpenAPI document`);
  }
  return { url, spec };
}

const changedKeys = (before = {}, after = {}) => {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((key) => {
    if (!(key in before)) return [`+ ${key}`];
    if (!(key in after)) return [`- ${key}`];
    return serialize(before[key]) === serialize(after[key]) ? [] : [`~ ${key}`];
  });
};

function summarize(committed, remote, url) {
  const sections = [
    ["paths", changedKeys(committed.paths, remote.paths)],
    ["schemas", changedKeys(committed.components?.schemas, remote.components?.schemas)],
  ];
  const lines = [`OpenAPI drift: ${url} differs from openapi/openapi.json`, ""];
  for (const [name, changes] of sections) {
    lines.push(`${name}:${changes.length ? "" : " no change"}`);
    lines.push(...changes.map((c) => `  ${c}`));
  }
  lines.push("", "(+ added, - removed, ~ changed) Run `npm run gen` and commit the result.");
  return lines.join("\n");
}

async function main() {
  const check = process.argv.includes("--check");
  const { url, spec } = await download(process.env.TUNER_OPENAPI_URL || DEFAULT_BASE_URL);
  const next = serialize(spec);
  if (!check) {
    await writeFile(OUT, next);
    process.stdout.write(`Wrote openapi/openapi.json from ${url}\n`);
    return;
  }
  const current = await readFile(OUT, "utf8");
  if (serialize(JSON.parse(current)) === next) {
    process.stdout.write(`No drift: ${url} matches openapi/openapi.json\n`);
    return;
  }
  const summary = summarize(JSON.parse(current), spec, url);
  process.stdout.write(`${summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${summary}\n\`\`\`\n`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`fetch-openapi: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
});
