import type { Clock, Timer } from "./transport";

export interface FakeClock extends Clock {
  set(t: number): void;
  advance(seconds: number): void;
}

export interface FakeTimer extends Timer {
  /** Number of registered, not-yet-cancelled callbacks. */
  readonly activeCount: number;
  /** `ms` of the most recent `every` call, or `null` if none yet. */
  readonly lastMs: number | null;
  /** Calls every active callback once. */
  fire(): void;
}

export interface FakeEnv {
  clock: FakeClock;
  timer: FakeTimer;
  /** Advances the clock by `seconds` in `step` increments, firing the timer after each. */
  run(seconds: number, step?: number): void;
}

/** A hand-driven clock and timer for testing a transport deterministically. */
export function createFakeEnv(): FakeEnv {
  let now = 0;
  let lastMs: number | null = null;
  const active = new Set<{ fn: () => void }>();

  const clock: FakeClock = {
    now: () => now,
    set(t) {
      now = t;
    },
    advance(seconds) {
      now += seconds;
    },
  };

  const timer: FakeTimer = {
    every(ms, fn) {
      lastMs = ms;
      const entry = { fn };
      active.add(entry);
      return () => void active.delete(entry);
    },
    get activeCount() {
      return active.size;
    },
    get lastMs() {
      return lastMs;
    },
    fire() {
      for (const entry of [...active]) {
        // A callback may cancel another during this round; a cancelled one must not run.
        if (active.has(entry)) entry.fn();
      }
    },
  };

  function run(seconds: number, step = 0.025): void {
    const start = now;
    // Each time is computed as start + i * step, so no floating-point error accumulates.
    const steps = Math.floor(seconds / step + 1e-9);
    for (let i = 1; i <= steps; i++) {
      now = start + i * step;
      timer.fire();
    }
    if (seconds - steps * step > 1e-9) {
      now = start + seconds;
      timer.fire();
    }
  }

  return { clock, timer, run };
}
