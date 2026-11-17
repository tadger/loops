import type { Note } from "@loops/core";

// A type alias, not an interface: only aliases are assignable to `Json`.
export type StepData = {
  /** 0–1. */
  gain: number;
  /** Seconds to fall to silence, DECAY_MIN–DECAY_MAX; DECAY_MAX means no decay. */
  decay: number;
  /** Playback-rate multiplier, RATE_MIN–RATE_MAX; 1 is the sample's own pitch. */
  rate: number;
};

export const DECAY_MIN = 0.02;
export const DECAY_MAX = 2;
export const RATE_MIN = 0.25;
export const RATE_MAX = 2;

export const DEFAULT_STEP_DATA: StepData = { gain: 1, decay: DECAY_MAX, rate: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function field(raw: unknown, fallback: number, min: number, max: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, min, max) : fallback;
}

/** `data` is untrusted (imported or hand-edited), so anything unusable falls back to the default. */
export function readStepData(note: Note): StepData {
  const data = note.data;
  const raw = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
  return {
    gain: field(raw.gain, DEFAULT_STEP_DATA.gain, 0, 1),
    decay: field(raw.decay, DEFAULT_STEP_DATA.decay, DECAY_MIN, DECAY_MAX),
    rate: field(raw.rate, DEFAULT_STEP_DATA.rate, RATE_MIN, RATE_MAX),
  };
}

export function clampStepData(data: StepData): StepData {
  return {
    gain: clamp(data.gain, 0, 1),
    decay: clamp(data.decay, DECAY_MIN, DECAY_MAX),
    rate: clamp(data.rate, RATE_MIN, RATE_MAX),
  };
}
