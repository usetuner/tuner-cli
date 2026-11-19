import { Command, CommanderError, Option } from "commander";
import type { GlobalFlags } from "../domain/config.js";
import { authLogin, authLogout, authStatus } from "../commands/auth.js";
import {
  agentsList,
  languagesList,
  noiseList,
  profilesList,
  scenariosList,
} from "../commands/lists.js";
import { runsCancel, runsGet } from "../commands/runs.js";
import type { CommandContext } from "../commands/shared.js";
import { simRun } from "../commands/sim-run.js";
import { makeDeps } from "./compose.js";
import { DEFAULT_TIMEOUT } from "../domain/inputs.js";
import { EXIT } from "../domain/exit.js";
import type { Runtime } from "../ports.js";
import { VERSION } from "../adapters/version.js";

const outputOption = () =>
  new Option("--output <format>", "output format").choices(["text", "json"]).default("text");
const agentOption = () =>
  new Option(
    "--agent <agent-id>",
    "agent ID (remote identifier) or numeric ID; overrides TUNER_AGENT_ID",
  );

const collect = (value: string, previous: string[] = []) => [...previous, value];

/** Parses argv and runs the command. Resolves with the exit code. */
export async function runCli(argv: string[], runtime: Runtime): Promise<number> {
  let exitCode: number = EXIT.OK;
  const program = new Command();
  const ctx = (cmd: Command): CommandContext => {
    const flags = cmd.optsWithGlobals() as GlobalFlags;
    return { flags, runtime, deps: makeDeps(runtime, flags) };
  };
  const action =
    <A extends unknown[]>(fn: (cmd: Command, ...args: A) => Promise<number>) =>
    async (...args: unknown[]) => {
      const cmd = args[args.length - 1] as Command;
      exitCode = await fn(cmd, ...(args.slice(0, -2) as A));
    };

  program
    .name("tuner")
    .description("Run Tuner voice-agent simulations from the command line.")
    .version(VERSION, "-V, --version", "print the version")
    .option("--api-key <key>", "Tuner API key; overrides TUNER_API_KEY and the stored key")
    .option("--base-url <url>", "API base URL; overrides TUNER_BASE_URL", undefined)
    .option("--verbose", "print requests and timings to stderr")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (s) => runtime.stdout.write(s),
      writeErr: (s) => runtime.stderr.write(s),
    })
    .addHelpText(
      "after",
      `
Environment: TUNER_API_KEY, TUNER_AGENT_ID, TUNER_WORKSPACE_ID, TUNER_BASE_URL (default https://api.usetuner.ai)

Exit codes: 0 every scenario passed, 1 a scenario failed its evals, 2 a problem you must fix
(bad flag, rejected key, unknown agent, tag or scenario, no credits, agent busy), 3 Tuner
couldn't finish the run (outage, 5xx, tuner_error, --timeout reached), 130 SIGINT,
143 SIGTERM. When several apply, the worst wins: 1, then 2, then 3.`,
    );

  const sim = program.command("sim").description("run simulations");
  sim
    .command("run")
    .description("start a simulation run and wait for its result")
    .option("--tag <tag>", "run the agent's scenarios with this tag")
    .option(
      "--scenario <id>",
      "run this scenario ID; repeat or comma-separate for several",
      collect,
    )
    .addOption(agentOption())
    .option("--language <language>", "caller language: a code (en-US) or full name")
    .option("--profile <name>", "test profile name")
    .option("--noise <slug>", "background noise slug")
    .option(
      "--noise-intensity <level>",
      "noise level: low, medium (default) or high, or 0.5, 1.0, 1.5; see tuner noise list",
    )
    .addOption(outputOption())
    .option("--no-wait", "print the run ID and exit without waiting")
    .option(
      "--timeout <duration>",
      "cancel the run after this long, e.g. 30m, 90s",
      DEFAULT_TIMEOUT,
    )
    .option(
      "--fail-on-inconclusive",
      "deprecated, no effect: inconclusive and timed-out runs exit 3",
    )
    .action(action((cmd) => simRun(ctx(cmd), cmd.opts())));

  const runs = program.command("runs").description("inspect or cancel runs");
  runs
    .command("get <run-id>")
    .description("print a run's status and result")
    .addOption(agentOption())
    .addOption(outputOption())
    .action(action((cmd, id: string) => runsGet(ctx(cmd), id, cmd.opts())));
  runs
    .command("cancel <run-id>")
    .description("cancel a run")
    .addOption(agentOption())
    .addOption(outputOption())
    .action(action((cmd, id: string) => runsCancel(ctx(cmd), id, cmd.opts())));

  program
    .command("scenarios")
    .description("scenario library")
    .command("list")
    .description("list the agent's scenarios")
    .option("--tag <tag>", "only scenarios with this exact tag")
    .addOption(agentOption())
    .addOption(outputOption())
    .action(action((cmd) => scenariosList(ctx(cmd), cmd.opts())));

  program
    .command("languages")
    .description("caller languages")
    .command("list")
    .description("list the values --language accepts")
    .addOption(outputOption())
    .action(action((cmd) => languagesList(ctx(cmd), cmd.opts())));

  program
    .command("noise")
    .description("background noise")
    .command("list")
    .description("list the values --noise accepts")
    .addOption(outputOption())
    .action(action((cmd) => noiseList(ctx(cmd), cmd.opts())));

  program
    .command("profiles")
    .description("test profiles")
    .command("list")
    .description("list the agent's profiles (values --profile accepts)")
    .addOption(agentOption())
    .addOption(outputOption())
    .action(action((cmd) => profilesList(ctx(cmd), cmd.opts())));

  program
    .command("agents")
    .description("agents")
    .command("list")
    .description("list the workspace's agents")
    .addOption(outputOption())
    .action(action((cmd) => agentsList(ctx(cmd), cmd.opts())));

  const auth = program.command("auth").description("manage the stored API key");
  auth
    .command("login")
    .description("validate an API key and store it (reads --api-key, stdin, or a prompt)")
    .action(action((cmd) => authLogin(ctx(cmd))));
  auth
    .command("logout")
    .description("delete the stored API key")
    .action(action((cmd) => authLogout(ctx(cmd))));
  auth
    .command("status")
    .description("show which key is in use and its workspace")
    .action(action((cmd) => authStatus(ctx(cmd))));

  for (const group of [sim, runs, auth, ...program.commands]) {
    group.exitOverride().configureOutput({
      writeOut: (s) => runtime.stdout.write(s),
      writeErr: (s) => runtime.stderr.write(s),
    });
    for (const sub of group.commands) {
      sub.exitOverride().configureOutput({
        writeOut: (s) => runtime.stdout.write(s),
        writeErr: (s) => runtime.stderr.write(s),
      });
    }
  }

  try {
    await program.parseAsync(expandHelpPath(argv), { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      // `tuner sim` with no subcommand prints help as an error (exitCode 1): a usage error.
      const ok =
        ["commander.helpDisplayed", "commander.version"].includes(err.code) ||
        (err.code === "commander.help" && err.exitCode === 0);
      return ok ? EXIT.OK : EXIT.USAGE;
    }
    throw err;
  }
  return exitCode;
}

const VALUE_FLAGS = new Set(["--api-key", "--base-url"]);

/** Commander's `help <cmd>` reads one name, so `help sim run` becomes `sim run --help`. */
function expandHelpPath(argv: string[]): string[] {
  let i = 0;
  while (i < argv.length && argv[i]!.startsWith("-")) i += VALUE_FLAGS.has(argv[i]!) ? 2 : 1;
  if (argv[i] !== "help" || argv.length - i < 3) return argv;
  return [...argv.slice(0, i), ...argv.slice(i + 1), "--help"];
}
