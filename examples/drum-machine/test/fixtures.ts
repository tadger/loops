import { steps } from "@loops/core";
import type { Loop } from "@loops/core";
import { STEP_TICKS } from "../src/loop-state";

/** A small one-bar loop on kit channels, so tests stay independent of the real beat. */
export function testLoop(): Loop {
  const pattern = (p: string) => steps(p, { stepTicks: STEP_TICKS });
  return {
    version: 1,
    bars: 1,
    beatsPerBar: 4,
    tempo: 92,
    channels: {
      kick: pattern("x------x --x-----"),
      snare: pattern("----x--- ----x---"),
      hihat: pattern("x-x-x-x- x-x-x-x-"),
      bass: [],
    },
  };
}
