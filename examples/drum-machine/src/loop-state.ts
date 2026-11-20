import { loopLength, setChannel } from "@loops/core";
import type { Loop, Note } from "@loops/core";
import { clampStepData, DEFAULT_STEP_DATA, readStepData } from "./step-data";
import type { StepData } from "./step-data";

/** One sixteenth note. */
export const STEP_TICKS = 24;

export const CHANNELS = ["kick", "snare", "hihat", "bass", "plong1", "plong2", "string1", "string2", "string3"] as const;

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
  const length = loopLength(loop);
  const base = step * STEP_TICKS;
  let lo = -MAX_NUDGE;
  let hi = MAX_NUDGE;
  if (note.duration !== undefined) {
    // A sustained note must fit the loop without wrapping; its duration is never trimmed.
    lo = Math.max(lo, -base);
    hi = Math.min(hi, length - note.duration - base);
    if (lo > hi) return loop;
  }
  const clamped = Math.max(lo, Math.min(hi, Math.round(nudge)));
  const at = (((base + clamped) % length) + length) % length;
  if (at === note.at) return loop;
  return setChannel(loop, channel, notesOf(loop, channel).map((n) => (n === note ? { ...note, at } : n)));
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

/** Null when the step is off; undefined when the note has no duration and so plays its whole sample. */
export function getDuration(loop: Loop, channel: string, step: number): number | null | undefined {
  const note = noteAt(loop, channel, step);
  return note === undefined ? null : note.duration;
}

/**
 * Holds a note for `duration` ticks, or releases it to play its whole sample when undefined. A held note must
 * fit the loop (see setNudge), so the length stops at the loop's end.
 */
export function setDuration(loop: Loop, channel: string, step: number, duration: number | undefined): Loop {
  const note = noteAt(loop, channel, step);
  if (note === undefined || note.duration === duration) return loop;
  const { duration: _old, ...rest } = note;
  let edited: Note = rest;
  if (duration !== undefined) {
    if (!Number.isFinite(duration)) return loop;
    const fitted = Math.max(1, Math.min(Math.round(duration), loopLength(loop) - note.at));
    if (fitted === note.duration) return loop;
    edited = { ...rest, duration: fitted };
  }
  return setChannel(loop, channel, notesOf(loop, channel).map((n) => (n === note ? edited : n)));
}

/**
 * Puts a note at `at` in a loop of `length` ticks. A sustained note never wraps (see setNudge), so an early nudge
 * past the start puts it on 0 instead, and its duration stops at the loop's end.
 */
function settle(note: Note, at: number, length: number): Note {
  if (at < 0) at = note.duration === undefined ? at + length : 0;
  return note.duration === undefined ? { ...note, at } : { ...note, at, duration: Math.min(note.duration, length - at) };
}

/**
 * Rebuilds every channel for a loop with `bars` bars. `newOwner` maps a note's owner step to its new owner step,
 * or to null to drop it. A note keeps its nudge, so a first-beat step nudged early (stored wrapped at the loop's
 * end) wraps again at the new end.
 */
function rebuild(loop: Loop, bars: number, newOwner: (owner: number) => number | null): Loop {
  const length = loopLength({ bars, beatsPerBar: loop.beatsPerBar });
  const steps = stepCount(loop);
  const entries = Object.entries(loop.channels).map(([channel, notes]) => {
    const moved: Note[] = [];
    for (const note of notes) {
      const unwrapped = Math.round(note.at / STEP_TICKS);
      const owner = newOwner(unwrapped % steps);
      if (owner === null) continue;
      moved.push(settle(note, owner * STEP_TICKS + (note.at - unwrapped * STEP_TICKS), length));
    }
    return [channel, moved.sort((a, b) => a.at - b.at)] as const;
  });
  return { ...loop, bars, channels: Object.fromEntries(entries) };
}

/** Appends an empty bar. */
export function addBar(loop: Loop): Loop {
  return rebuild(loop, loop.bars + 1, (owner) => owner);
}

/** Deletes a bar's steps and shifts later bars left; the last remaining bar is never removed. */
export function removeBar(loop: Loop, bar: number): Loop {
  if (loop.bars <= 1 || !Number.isInteger(bar) || bar < 0 || bar >= loop.bars) return loop;
  const perBar = stepsPerBar(loop);
  return rebuild(loop, loop.bars - 1, (owner) => {
    const ownerBar = Math.floor(owner / perBar);
    if (ownerBar === bar) return null;
    return ownerBar > bar ? owner - perBar : owner;
  });
}

/** How many channel steps have a note in the bar. */
export function stepsInBar(loop: Loop, bar: number): number {
  const perBar = stepsPerBar(loop);
  let count = 0;
  for (const notes of Object.values(loop.channels)) {
    const owned = new Set<number>();
    for (const note of notes) {
      const owner = stepOf(loop, note.at);
      if (Math.floor(owner / perBar) === bar) owned.add(owner);
    }
    count += owned.size;
  }
  return count;
}

/** A note in a bar clip: its step within the bar, and its offset from that step's grid line. */
export type ClippedNote = Omit<Note, "at"> & { step: number; nudge: number };

/** A bar's steps, kept apart from the loop so they can be pasted into any bar of the same size. */
export interface BarClip {
  stepsPerBar: number;
  /** Only the channels that have a step in the bar. */
  channels: Record<string, ClippedNote[]>;
}

function ownedBy(loop: Loop, note: Note, bar: number): boolean {
  return Math.floor(stepOf(loop, note.at) / stepsPerBar(loop)) === bar;
}

/** Copies every channel's steps in the bar; a bar that doesn't exist gives an empty clip. */
export function copyBar(loop: Loop, bar: number): BarClip {
  const perBar = stepsPerBar(loop);
  const channels = Object.entries(loop.channels)
    .map(([channel, notes]) => {
      const clipped = notes
        .filter((note) => ownedBy(loop, note, bar))
        .map(({ at, ...rest }): ClippedNote => ({ ...structuredClone(rest), step: stepOf(loop, at) % perBar, nudge: nudgeOf(at) }));
      return [channel, clipped] as const;
    })
    .filter(([, clipped]) => clipped.length > 0);
  return { stepsPerBar: perBar, channels: Object.fromEntries(channels) };
}

/** Replaces the bar's steps, in every channel, with the clip's. */
export function pasteBar(loop: Loop, bar: number, clip: BarClip): Loop {
  const perBar = stepsPerBar(loop);
  if (!Number.isInteger(bar) || bar < 0 || bar >= loop.bars || clip.stepsPerBar !== perBar) return loop;
  const length = loopLength(loop);
  let next = loop;
  for (const channel of new Set([...Object.keys(loop.channels), ...Object.keys(clip.channels)])) {
    const kept = notesOf(loop, channel).filter((note) => !ownedBy(loop, note, bar));
    const clipped = Object.hasOwn(clip.channels, channel) ? clip.channels[channel]! : [];
    if (clipped.length === 0 && kept.length === notesOf(loop, channel).length) continue;
    const added = clipped.map(({ step, nudge, ...rest }) =>
      settle({ ...structuredClone(rest), at: 0 }, (bar * perBar + step) * STEP_TICKS + nudge, length),
    );
    next = setChannel(next, channel, [...kept, ...added]);
  }
  return next;
}
