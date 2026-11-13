import { describe, expect, it } from "vitest";
import {
  intensitiesText,
  noiseLine,
  painter,
  scenarioLine,
  summaryLine,
  table,
  terminalOutput,
  useColor,
} from "../../src/adapters/terminal.js";
import { summarize } from "../../src/domain/run-summary.js";
import { FakeApi, call, makeRun, makeRuntime } from "../helpers.js";

describe("terminal renderer", () => {
  it("colors only a TTY without NO_COLOR", () => {
    expect(useColor({ write: () => {}, isTTY: true }, { env: {} })).toBe(true);
    expect(useColor({ write: () => {}, isTTY: true }, { env: { NO_COLOR: "1" } })).toBe(false);
    expect(useColor({ write: () => {} }, { env: {} })).toBe(false);
    expect(painter(true)(31, "x")).toBe("\u001b[31mx\u001b[0m");
  });

  it("prints a scenario line with failed evals and tuner errors", () => {
    const plain = painter(false);
    expect(
      scenarioLine(
        call({ verdict: "failed", failed_evals: [{ name: "Greets", value: 0 }] } as never),
        plain,
      ),
    ).toBe("  ✗ failed          Reschedule an existing booking   failed evals: Greets");
    expect(
      scenarioLine(
        call({
          verdict: "platform_error",
          failure_category: "tuner_error",
          failure: { message: "SIP 503" },
        } as never),
        plain,
      ),
    ).toContain("! platform error  Reschedule an existing booking   SIP 503");
    expect(scenarioLine(call({ verdict: "brand_new" as never }), plain)).toContain("? brand_new");
  });

  it("prints intensities and the run's noise as the API sends them", () => {
    expect(
      intensitiesText([
        { name: "low", value: 0.5 },
        { name: "medium", value: 1 },
      ]),
    ).toBe("low 0.5 · medium 1.0");
    expect(intensitiesText(undefined)).toBe("-");
    expect(intensitiesText([])).toBe("-");
    expect(noiseLine(makeRun({ noise_intensity: 1.5 }))).toBe("Noise: cafe · intensity 1.5");
    expect(noiseLine(makeRun({ noise_intensity: null }))).toBe("Noise: cafe");
    expect(noiseLine(makeRun({ noise_environment: null }))).toBeUndefined();
    expect(noiseLine(undefined)).toBeUndefined();
  });

  it("joins the summary and pads the table", () => {
    const run = makeRun({ simulation_calls: [call(), call({ verdict: "canceled" })] });
    expect(summaryLine(summarize(run))).toBe("1 passed · 0 failed · 0 inconclusive · 1 canceled");
    expect(table(["A", "BB"], [["xyz", "1"]])).toBe("A    BB\nxyz  1\n");
  });

  it("prints each verdict once, as it changes", () => {
    const rt = makeRuntime(new FakeApi());
    const out = terminalOutput(rt, false);
    out.progress("hello");
    out.run(makeRun({ simulation_calls: [call({ verdict: "pending" })] }));
    out.run(makeRun());
    out.run(makeRun());
    out.run(undefined);
    expect(rt.err()).toBe("hello\n");
    expect(rt.out().match(/passed/g)).toHaveLength(1);
  });

  it("puts verdicts on stderr with --output json", () => {
    const rt = makeRuntime(new FakeApi());
    terminalOutput(rt, true).run(makeRun());
    expect(rt.out()).toBe("");
    expect(rt.err()).toContain("✓ passed");
  });
});
