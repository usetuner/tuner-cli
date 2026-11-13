import type { Run } from "../../src/domain/types.js";
import type { Output } from "../../src/ports.js";

/** Records what a use case shows. */
export class FakeOutput implements Output {
  readonly lines: string[] = [];
  readonly runs: (Run | undefined)[] = [];

  progress(line: string): void {
    this.lines.push(line);
  }

  run(run: Run | undefined): void {
    this.runs.push(run);
  }
}
