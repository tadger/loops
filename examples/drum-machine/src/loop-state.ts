import { setChannel, steps, toggleNote } from "@loops/core";
import type { Loop } from "@loops/core";
import { clampStepData, DEFAULT_STEP_DATA, readStepData } from "./step-data";
import type { StepData } from "./step-data";

/** One sixteenth note. */
export const STEP_TICKS = 24;

export const CHANNELS = ["kick", "sd", "chh", "clap"] as const;

export function createInitialLoop(): Loop {
  const pattern = (p: string) => steps(p, { stepTicks: STEP_TICKS, data: DEFAULT_STEP_DATA });
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
  return toggleNote(loop, channel, step * STEP_TICKS, { data: DEFAULT_STEP_DATA });
}

export function isStepOn(loop: Loop, channel: string, step: number): boolean {
  const notes = Object.hasOwn(loop.channels, channel) ? loop.channels[channel]! : [];
  return notes.some((n) => n.at === step * STEP_TICKS);
}

function noteAt(loop: Loop, channel: string, step: number) {
  const notes = Object.hasOwn(loop.channels, channel) ? loop.channels[channel]! : [];
  return notes.find((n) => n.at === step * STEP_TICKS);
}

export function getStepData(loop: Loop, channel: string, step: number): StepData | null {
  const note = noteAt(loop, channel, step);
  return note === undefined ? null : readStepData(note);
}

export function setStepData(loop: Loop, channel: string, step: number, patch: Partial<StepData>): Loop {
  const note = noteAt(loop, channel, step);
  if (note === undefined) return loop;
  const current = readStepData(note);
  const next = clampStepData({
    gain: Number.isFinite(patch.gain) ? patch.gain! : current.gain,
    attack: Number.isFinite(patch.attack) ? patch.attack! : current.attack,
  });
  if (next.gain === current.gain && next.attack === current.attack) return loop;
  const notes = loop.channels[channel]!.map((n) => (n === note ? { at: n.at, data: next } : n));
  return setChannel(loop, channel, notes);
}
