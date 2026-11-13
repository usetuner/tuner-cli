import { Command, CommanderError, Option } from "commander";
import type { GlobalFlags } from "./domain/config.js";
import { authLogin, authLogout, authStatus } from "./commands/auth.js";
import {
  agentsList,
  languagesList,
  noiseList,
  profilesList,
  scenariosList,
} from "./commands/lists.js";
import { runsCancel, runsGet } from "./commands/runs.js";
import type { CommandContext } from "./commands/shared.js";
import { simRun } from "./commands/sim-run.js";
import { makeDeps } from "./cli/compose.js";
import { DEFAULT_TIMEOUT } from "./domain/inputs.js";
import { EXIT } from "./domain/exit.js";
import type { Runtime } from "./ports.js";
import { VERSION } from "./adapters/version.js";

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

Exit codes: 0 passed (or inconclusive, timeout, canceled without --fail-on-inconclusive),
1 agent failed, 2 your input or account stopped the run (bad key, unknown name, no credits),
130 SIGINT, 143 SIGTERM. Tuner being unreachable is inconclusive, not 2.`,
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
    .addOption(outputOption())
    .option("--no-wait", "print the run ID and exit without waiting")
    .option(
      "--timeout <duration>",
      "cancel the run after this long, e.g. 30m, 90s",
      DEFAULT_TIMEOUT,
    )
    .option("--fail-on-inconclusive", "exit 1 on inconclusive, timeout or canceled runs")
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
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      const ok = ["commander.helpDisplayed", "commander.version", "commander.help"].includes(
        err.code,
      );
      if (ok) return EXIT.OK;
      return EXIT.NOTHING_RAN;
    }
    throw err;
  }
  return exitCode;
}
