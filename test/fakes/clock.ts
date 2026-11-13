import type { Clock } from "../../src/ports.js";

/** A `Clock` whose sleeps return at once and move time forward. */
export class FakeClock implements Clock {
  readonly sleeps: number[] = [];

  constructor(public time = 1_000_000) {}

  now(): number {
    return this.time;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    this.sleeps.push(ms);
    this.time += Math.max(0, ms);
    return Promise.resolve();
  }
}
