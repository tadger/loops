import type { Note } from "@loops/core";

// A type alias, not an interface: only aliases are assignable to `Json`.
export type StepData = {
  /** 0–1. */
  gain: number;
  /** Seconds of fade-in, 0–ATTACK_MAX. */
  attack: number;
};

export const DEFAULT_STEP_DATA: StepData = { gain: 1, attack: 0 };

export const ATTACK_MAX = 0.1;

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/** `data` is untrusted (imported or hand-edited), so anything unusable falls back to the default. */
export function readStepData(note: Note): StepData {
  const data = note.data;
  const raw = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
  const { gain, attack } = raw;
  return {
    gain: typeof gain === "number" && Number.isFinite(gain) ? clamp(gain, 1) : DEFAULT_STEP_DATA.gain,
    attack: typeof attack === "number" && Number.isFinite(attack) ? clamp(attack, ATTACK_MAX) : DEFAULT_STEP_DATA.attack,
  };
}

export function clampStepData(data: StepData): StepData {
  return { gain: clamp(data.gain, 1), attack: clamp(data.attack, ATTACK_MAX) };
}
