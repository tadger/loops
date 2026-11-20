import type { Loop } from "@loops/core";
import { MAX_NUDGE, getDuration, getNudge, getStepData, setDuration, setNudge, setStepData } from "./loop-state";
import { DECAY_MAX, DECAY_MIN, RATE_MAX, RATE_MIN } from "./step-data";

/** The length dial runs from a quarter of a step to one 4/4 bar; its top end means no duration. */
const LENGTH_MIN = 6;
const LENGTH_MAX = 384;

export interface StepParam {
  id: "gain" | "decay" | "length" | "pitch" | "timing";
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** Values the dial marks with short ticks, when the quarter points of the range would mean nothing. */
  ticks?: readonly number[];
  /** Null when the step is off. */
  get(loop: Loop, channel: string, step: number): number | null;
  set(loop: Loop, channel: string, step: number, value: number): Loop;
  format(value: number): string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toSemitones = (rate: number) => 12 * Math.log2(rate);
const MINUS = "−";
const plural = (n: number) => (n === 1 ? "tick" : "ticks");

export const STEP_PARAMS: readonly StepParam[] = [
  {
    id: "gain",
    label: "gain",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 1,
    get: (loop, channel, step) => getStepData(loop, channel, step)?.gain ?? null,
    set: (loop, channel, step, value) => setStepData(loop, channel, step, { gain: value }),
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    id: "decay",
    label: "decay",
    min: DECAY_MIN * 1000,
    max: DECAY_MAX * 1000,
    step: 10,
    defaultValue: DECAY_MAX * 1000,
    get: (loop, channel, step) => {
      const data = getStepData(loop, channel, step);
      return data === null ? null : Math.round(data.decay * 1000);
    },
    set: (loop, channel, step, value) => setStepData(loop, channel, step, { decay: value / 1000 }),
    format: (value) => (value >= DECAY_MAX * 1000 ? "off" : `${value} ms`),
  },
  {
    id: "length",
    label: "length",
    min: LENGTH_MIN,
    max: LENGTH_MAX,
    step: LENGTH_MIN,
    defaultValue: LENGTH_MAX,
    // A plain step has no duration. An imported one past the dial's range reads as the longest length, not off.
    get: (loop, channel, step) => {
      const duration = getDuration(loop, channel, step);
      if (duration === null) return null;
      return duration === undefined ? LENGTH_MAX : clamp(duration, LENGTH_MIN, LENGTH_MAX - 1);
    },
    set: (loop, channel, step, value) => setDuration(loop, channel, step, value >= LENGTH_MAX ? undefined : value),
    format: (value) => (value >= LENGTH_MAX ? "off" : `${value} ticks`),
  },
  {
    id: "pitch",
    label: "pitch",
    min: toSemitones(RATE_MIN),
    max: toSemitones(RATE_MAX),
    step: 0.1,
    defaultValue: 0,
    // The octave below; 0 and the range ends are already marked.
    ticks: [-12],
    get: (loop, channel, step) => {
      const data = getStepData(loop, channel, step);
      return data === null ? null : toSemitones(data.rate);
    },
    // Clamped before converting: an extreme value would overflow 2**x to Infinity and be ignored.
    // Rounded so the exported JSON stays readable; 0 st stays exactly 1, the sparse default.
    set: (loop, channel, step, value) =>
      setStepData(loop, channel, step, {
        rate: Math.round(2 ** (clamp(value, toSemitones(RATE_MIN), toSemitones(RATE_MAX)) / 12) * 1e4) / 1e4,
      }),
    format: (value) => {
      const text = Math.abs(value).toFixed(1);
      return `${value < 0 && text !== "0.0" ? MINUS : ""}${text} st`;
    },
  },
  {
    id: "timing",
    label: "timing",
    min: -MAX_NUDGE,
    max: MAX_NUDGE,
    step: 1,
    defaultValue: 0,
    // An imported tie reads −12, which the slider cannot show.
    get: (loop, channel, step) => {
      const nudge = getNudge(loop, channel, step);
      return nudge === null ? null : clamp(nudge, -MAX_NUDGE, MAX_NUDGE);
    },
    set: setNudge,
    format: (value) => {
      const ticks = Math.round(value);
      if (ticks === 0) return "on the grid";
      return `${Math.abs(ticks)} ${plural(Math.abs(ticks))} ${ticks > 0 ? "late" : "early"}`;
    },
  },
];
