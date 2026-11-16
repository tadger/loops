import type { Clock, Timer } from "@loops/core";

export interface Audio {
  ctx: AudioContext;
  samples: Record<string, AudioBuffer>;
  clock: Clock;
  timer: Timer;
}

// Stand-ins until the first Play click creates the AudioContext.
export const inertClock: Clock = { now: () => 0 };
export const inertTimer: Timer = { every: () => () => {} };
