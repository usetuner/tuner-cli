import type { Signal } from "../../src/domain/exit.js";
import type { Signals } from "../../src/ports.js";

export class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

/** `Signals` a test can raise; `exit` throws `ExitCalled` instead of exiting. */
export class FakeSignals implements Signals {
  readonly exits: number[] = [];
  private readonly handlers = new Set<(signal: Signal) => void>();

  onSignal(handler: (signal: Signal) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(signal: Signal): void {
    for (const h of [...this.handlers]) h(signal);
  }

  get listening(): number {
    return this.handlers.size;
  }

  exit(code: number): never {
    this.exits.push(code);
    throw new ExitCalled(code);
  }
}
