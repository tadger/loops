import { loopLength, setChannel, steps } from "@loops/core";
import type { Loop } from "@loops/core";
import { clampStepData, DEFAULT_STEP_DATA, readStepData } from "./step-data";
import type { StepData } from "./step-data";

/** One sixteenth note. */
export const STEP_TICKS = 24;

export const CHANNELS = ["kick", "sd", "chh", "clap"] as const;

export function createInitialLoop(): Loop {
  const pattern = (p: string) => steps(p, { stepTicks: STEP_TICKS });
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

export const MAX_NUDGE = 11;

export function stepsPerBar(loop: Pick<Loop, "beatsPerBar">): number {
  return loop.beatsPerBar * 4;
}

export function stepCount(loop: Pick<Loop, "bars" | "beatsPerBar">): number {
  return loop.bars * stepsPerBar(loop);
}

/** The nearest sixteenth; a tick past the last step's half-way point wraps to step 0. */
export function stepOf(loop: Pick<Loop, "bars" | "beatsPerBar">, at: number): number {
  return Math.round(at / STEP_TICKS) % stepCount(loop);
}

export function nudgeOf(at: number): number {
  return at - Math.round(at / STEP_TICKS) * STEP_TICKS;
}

function notesOf(loop: Loop, channel: string) {
  return Object.hasOwn(loop.channels, channel) ? loop.channels[channel]! : [];
}

function noteAt(loop: Loop, channel: string, step: number) {
  return notesOf(loop, channel).find((n) => stepOf(loop, n.at) === step);
}

export function toggleStep(loop: Loop, channel: string, step: number): Loop {
  const notes = notesOf(loop, channel);
  if (noteAt(loop, channel, step) !== undefined) {
    return setChannel(loop, channel, notes.filter((n) => stepOf(loop, n.at) !== step));
  }
  return setChannel(loop, channel, [...notes, { at: step * STEP_TICKS }]);
}

export function isStepOn(loop: Loop, channel: string, step: number): boolean {
  return noteAt(loop, channel, step) !== undefined;
}

export function getNudge(loop: Loop, channel: string, step: number): number | null {
  const note = noteAt(loop, channel, step);
  return note === undefined ? null : nudgeOf(note.at);
}

export function setNudge(loop: Loop, channel: string, step: number, nudge: number): Loop {
  const note = noteAt(loop, channel, step);
  if (note === undefined || !Number.isFinite(nudge)) return loop;
  const clamped = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, Math.round(nudge)));
  const length = loopLength(loop);
  const at = (((step * STEP_TICKS + clamped) % length) + length) % length;
  if (at === note.at) return loop;
  const moved = { ...note, at };
  if (moved.duration !== undefined && at + moved.duration > length) moved.duration = length - at;
  return setChannel(loop, channel, notesOf(loop, channel).map((n) => (n === note ? moved : n)));
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
    decay: Number.isFinite(patch.decay) ? patch.decay! : current.decay,
    rate: Number.isFinite(patch.rate) ? patch.rate! : current.rate,
  });
  if (next.gain === current.gain && next.decay === current.decay && next.rate === current.rate) return loop;
  // Sparse: only non-default fields are stored, so a plain step carries no `data`.
  const data: Record<string, number> = {};
  for (const key of ["gain", "decay", "rate"] as const) {
    if (next[key] !== DEFAULT_STEP_DATA[key]) data[key] = next[key];
  }
  const { data: _old, ...rest } = note;
  const edited = Object.keys(data).length > 0 ? { ...rest, data } : rest;
  return setChannel(loop, channel, notesOf(loop, channel).map((n) => (n === note ? edited : n)));
}
