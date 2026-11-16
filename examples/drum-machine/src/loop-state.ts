import { steps, toggleNote } from "@loops/core";
import type { Loop } from "@loops/core";

/** One sixteenth note. */
export const STEP_TICKS = 24;

export const CHANNELS = ["kick", "sd", "chh", "clap"] as const;

const DATA = { gain: 1 };

export function createInitialLoop(): Loop {
  const pattern = (p: string) => steps(p, { stepTicks: STEP_TICKS, data: DATA });
  return {
    version: 1,
    bars: 1,
    beatsPerBar: 4,
    tempo: 92,
    channels: {
      kick: pattern("x------x --x-----"),
      sd: pattern("----x--- ----x---"),
      chh: pattern("x-x-x-x- x-x-x-x-"),
      clap: [],
    },
  };
}

export function toggleStep(loop: Loop, channel: string, step: number): Loop {
  return toggleNote(loop, channel, step * STEP_TICKS, { data: DATA });
}

export function isStepOn(loop: Loop, channel: string, step: number): boolean {
  const notes = Object.hasOwn(loop.channels, channel) ? loop.channels[channel]! : [];
  return notes.some((n) => n.at === step * STEP_TICKS);
}
