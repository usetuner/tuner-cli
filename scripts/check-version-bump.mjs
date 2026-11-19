#!/usr/bin/env node
// Fails a PR that changes shipped files without bumping the version above npm and the base branch.
// Usage: node scripts/check-version-bump.mjs [base-ref]   (default: origin/main)
/* global process, console */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SHIPPED = [/^src\//, /^schema\//, /^package-lock\.json$/];
const BUMP_HINT =
  "Run `npm version patch --no-git-tag-version` (or minor/major) and add a CHANGELOG.md entry.";

export function compareSemver(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v);
    if (!m) throw new Error(`not a semver version: ${v}`);
    return { nums: m.slice(1, 4).map(Number), pre: m[4] };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, "en", { numeric: true });
}

// package.json ships, but a change to only `version` or `scripts` does not change what users get.
function packageJsonShips(basePkg, headPkg) {
  const strip = ({ version: _v, scripts: _s, ...rest }) => JSON.stringify(rest);
  return strip(basePkg) !== strip(headPkg);
}

/** Returns a list of error messages; empty means the check passes. */
export function checkVersionBump({ changedFiles, basePkg, headPkg, npmVersion, changelog }) {
  const shipped = changedFiles.filter(
    (f) =>
      SHIPPED.some((re) => re.test(f)) ||
      (f === "package.json" && packageJsonShips(basePkg, headPkg)),
  );
  const bumped = headPkg.version !== basePkg.version;
  if (!bumped && shipped.length === 0) return [];

  const errors = [];
  if (!bumped)
    errors.push(
      `These files ship in the package but the version is still ${headPkg.version}: ${shipped.join(", ")}.`,
    );
  if (bumped && compareSemver(headPkg.version, basePkg.version) <= 0)
    errors.push(
      `Version ${headPkg.version} must be greater than ${basePkg.version} on the base branch.`,
    );
  if (bumped && npmVersion && compareSemver(headPkg.version, npmVersion) <= 0)
    errors.push(
      `Version ${headPkg.version} must be greater than ${npmVersion}, the latest on npm.`,
    );
  if (bumped && !changelog.split("\n").some((line) => line.startsWith(`## [${headPkg.version}]`)))
    errors.push(`CHANGELOG.md has no "## [${headPkg.version}]" heading.`);
  if (errors.length) errors.push(BUMP_HINT);
  return errors;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function latestOnNpm(name) {
  try {
    return execFileSync("npm", ["view", name, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (String(err.stderr).includes("E404")) return ""; // never published
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.argv[2] ?? "origin/main";
  const headPkg = JSON.parse(readFileSync("package.json", "utf8"));
  const errors = checkVersionBump({
    changedFiles: git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean),
    basePkg: JSON.parse(git("show", `${base}:package.json`)),
    headPkg,
    npmVersion: latestOnNpm(headPkg.name),
    changelog: readFileSync("CHANGELOG.md", "utf8"),
  });
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log(`version-bump: ok (${headPkg.version})`);
}
