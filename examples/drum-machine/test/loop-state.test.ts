import { parseLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import {
  getNudge,
  getStepData,
  isStepOn,
  MAX_NUDGE,
  nudgeOf,
  setNudge,
  setStepData,
  stepCount,
  stepOf,
  stepsPerBar,
  STEP_TICKS,
  toggleStep,
} from "../src/loop-state";
import { testLoop } from "./fixtures";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe("toggleStep", () => {
  it("adds a note at the step's tick, then removes it", () => {
    const loop = testLoop();
    const on = toggleStep(loop, "kick", 3);
    expect(on.channels.kick).toContainEqual({ at: 3 * STEP_TICKS });
    expect(3 * STEP_TICKS).toBe(72);
    expect(isStepOn(on, "kick", 3)).toBe(true);

    const off = toggleStep(on, "kick", 3);
    expect(isStepOn(off, "kick", 3)).toBe(false);
    expect(off.channels.kick).toEqual(loop.channels.kick);
  });

  it("does not mutate a frozen loop", () => {
    const loop = deepFreeze(testLoop());
    const snapshot = structuredClone(loop);
    expect(isStepOn(toggleStep(loop, "bass", 0), "bass", 0)).toBe(true);
    expect(isStepOn(toggleStep(loop, "kick", 0), "kick", 0)).toBe(false);
    expect(loop).toEqual(snapshot);
  });
});

describe("isStepOn", () => {
  it("is false for a channel the loop does not have", () => {
    expect(isStepOn(testLoop(), "cowbell", 0)).toBe(false);
  });
});

describe("getStepData", () => {
  it("is null for an off step and the note's data for a lit one", () => {
    const loop = setStepData(testLoop(), "kick", 0, { gain: 0.3 });
    expect(getStepData(loop, "kick", 1)).toBeNull();
    expect(getStepData(loop, "cowbell", 0)).toBeNull();
    expect(getStepData(loop, "kick", 0)).toEqual({ gain: 0.3, decay: 2, rate: 1 });
  });
});

describe("setStepData", () => {
  const kick0 = (loop: Loop) => loop.channels.kick![0]!;

  it("stores only the fields that differ from the defaults", () => {
    const gained = setStepData(testLoop(), "kick", 0, { gain: 0.8 });
    expect(kick0(gained)).toEqual({ at: 0, data: { gain: 0.8 } });
    const rated = setStepData(gained, "kick", 0, { rate: 0.55 });
    expect(kick0(rated)).toEqual({ at: 0, data: { gain: 0.8, rate: 0.55 } });
  });

  it("removes a field set back to its default, and data when all are default", () => {
    const edited = setStepData(setStepData(testLoop(), "kick", 0, { gain: 0.8 }), "kick", 0, { rate: 0.55 });
    const ungained = setStepData(edited, "kick", 0, { gain: 1 });
    expect(kick0(ungained)).toEqual({ at: 0, data: { rate: 0.55 } });
    const clean = setStepData(ungained, "kick", 0, { rate: 1 });
    expect(kick0(clean)).toEqual({ at: 0 });
    expect(clean.channels.kick![0]).not.toHaveProperty("data");
  });

  it("changes only that note, keeping other channels' references", () => {
    const loop = testLoop();
    const next = setStepData(setStepData(loop, "kick", 0, { decay: 0.3 }), "kick", 0, { gain: 0.3 });
    expect(getStepData(next, "kick", 0)).toEqual({ gain: 0.3, decay: 0.3, rate: 1 });
    expect(next.channels.kick!.slice(1)).toEqual(loop.channels.kick!.slice(1));
    expect(next.channels.snare).toBe(loop.channels.snare);
    expect(next.channels.hihat).toBe(loop.channels.hihat);
    expect(next.channels.bass).toBe(loop.channels.bass);
  });

  it("clamps out-of-range patches", () => {
    const loop = setStepData(testLoop(), "kick", 0, { gain: 9, decay: 0, rate: 9 });
    expect(getStepData(loop, "kick", 0)).toEqual({ gain: 1, decay: 0.02, rate: 2 });
    const low = setStepData(loop, "kick", 0, { gain: -9, decay: 9, rate: 0 });
    expect(getStepData(low, "kick", 0)).toEqual({ gain: 0, decay: 2, rate: 0.25 });
  });

  it("rewrites data from the known fields only, dropping an old attack key", () => {
    const base = testLoop();
    const loop: Loop = { ...base, channels: { ...base.channels, bass: [{ at: 0, data: { gain: 0.5, attack: 0.05, extra: "x" } }] } };
    expect(setStepData(loop, "bass", 0, { rate: 0.5 }).channels.bass).toEqual([{ at: 0, data: { gain: 0.5, rate: 0.5 } }]);
  });

  it("keeps the note's duration", () => {
    const base = testLoop();
    const loop: Loop = { ...base, channels: { ...base.channels, bass: [{ at: 0, duration: 12 }] } };
    expect(setStepData(loop, "bass", 0, { gain: 0.3 }).channels.bass).toEqual([{ at: 0, duration: 12, data: { gain: 0.3 } }]);
  });

  it("does not mutate a frozen loop", () => {
    const loop = deepFreeze(testLoop());
    const snapshot = structuredClone(loop);
    expect(getStepData(setStepData(loop, "kick", 0, { gain: 0.2 }), "kick", 0)?.gain).toBe(0.2);
    expect(loop).toEqual(snapshot);
  });

  it("applies the finite fields of a mixed patch and ignores NaN", () => {
    const next = setStepData(testLoop(), "kick", 0, { gain: NaN, decay: 0.5 });
    expect(getStepData(next, "kick", 0)).toEqual({ gain: 1, decay: 0.5, rate: 1 });
  });

  it("returns the same loop for an off step", () => {
    const loop = testLoop();
    expect(setStepData(loop, "kick", 1, { gain: 0.2 })).toBe(loop);
    expect(setStepData(loop, "cowbell", 0, { gain: 0.2 })).toBe(loop);
  });

  it("returns the same loop when nothing changes", () => {
    const loop = testLoop();
    expect(setStepData(loop, "kick", 0, { gain: 1 })).toBe(loop);
    expect(setStepData(loop, "kick", 0, {})).toBe(loop);
    expect(setStepData(loop, "kick", 0, { gain: 5 })).toBe(loop);
    expect(setStepData(loop, "kick", 0, { gain: NaN, rate: Infinity })).toBe(loop);
    const edited = setStepData(loop, "kick", 0, { gain: 0.8 });
    expect(setStepData(edited, "kick", 0, { gain: 0.8 })).toBe(edited);
  });
});

describe("step identity and nudge", () => {
  const twoBars = (kick: Loop["channels"][string]): Loop => ({
    version: 1,
    bars: 2,
    beatsPerBar: 4,
    tempo: 92,
    channels: { kick },
  });
  const empty = twoBars([]);

  it("sizes the grid from the loop", () => {
    expect(MAX_NUDGE).toBe(11);
    expect([stepsPerBar(empty), stepCount(empty)]).toEqual([16, 32]);
    expect(stepCount({ bars: 1, beatsPerBar: 4 })).toBe(16);
    expect(stepCount({ bars: 1, beatsPerBar: 3 })).toBe(12);
  });

  it("identifies a tick with its nearest sixteenth, wrapping at the loop end", () => {
    expect([0, 50, 183, 761].map((at) => stepOf(empty, at))).toEqual([0, 2, 8, 0]);
    expect([50, 183, 761].map(nudgeOf)).toEqual([2, -9, -7]);
  });

  it("reads a nudged note as its step's note", () => {
    const loop = twoBars([{ at: 50 }]);
    expect(isStepOn(loop, "kick", 2)).toBe(true);
    expect(isStepOn(loop, "kick", 1)).toBe(false);
    expect(getNudge(loop, "kick", 2)).toBe(2);
    expect(getNudge(loop, "kick", 1)).toBeNull();
    expect(getNudge(loop, "cowbell", 2)).toBeNull();
  });

  it("moves a note to its step's tick plus the nudge", () => {
    const loop = deepFreeze(twoBars([{ at: 50, data: { gain: 0.5 } }]));
    const next = setNudge(loop, "kick", 2, -3);
    expect(next.channels.kick).toEqual([{ at: 45, data: { gain: 0.5 } }]);
    expect(loop.channels.kick).toEqual([{ at: 50, data: { gain: 0.5 } }]);
  });

  it("returns the same loop when the nudge is unchanged or the step is off", () => {
    const loop = twoBars([{ at: 50 }]);
    expect(setNudge(loop, "kick", 2, 2)).toBe(loop);
    expect(setNudge(loop, "kick", 3, 5)).toBe(loop);
    expect(setNudge(loop, "cowbell", 2, 5)).toBe(loop);
  });

  it("rounds and clamps the nudge, ignoring a non-finite one", () => {
    const loop = twoBars([{ at: 48 }]);
    expect(getNudge(setNudge(loop, "kick", 2, 99), "kick", 2)).toBe(MAX_NUDGE);
    expect(getNudge(setNudge(loop, "kick", 2, -99), "kick", 2)).toBe(-MAX_NUDGE);
    expect(getNudge(setNudge(loop, "kick", 2, 2.6), "kick", 2)).toBe(3);
    expect(setNudge(loop, "kick", 2, NaN)).toBe(loop);
  });

  it("wraps a note nudged back past the loop start, and does not wrap forward within the loop", () => {
    const first = twoBars([{ at: 0 }]);
    expect(setNudge(first, "kick", 0, -7).channels.kick).toEqual([{ at: 761 }]);
    const last = twoBars([{ at: 744 }]);
    expect(setNudge(last, "kick", 31, 11).channels.kick).toEqual([{ at: 755 }]);
  });

  it("trims a wrapped note's duration to the loop end", () => {
    const loop = twoBars([{ at: 0, duration: 60 }]);
    const next = setNudge(loop, "kick", 0, -7);
    expect(next.channels.kick).toEqual([{ at: 761, duration: 7 }]);
    expect(parseLoop(next).ok).toBe(true);
  });

  it("toggles off a nudged note and toggles on at the grid tick", () => {
    const loop = deepFreeze(twoBars([{ at: 50 }]));
    const off = toggleStep(loop, "kick", 2);
    expect(off.channels.kick).toEqual([]);
    expect(toggleStep(off, "kick", 3).channels.kick).toEqual([{ at: 3 * STEP_TICKS }]);
  });

  it("reads the first of several notes on one step and toggling removes them all", () => {
    const loop = deepFreeze(twoBars([{ at: 48 }, { at: 50 }]));
    expect(getNudge(loop, "kick", 2)).toBe(0);
    expect(toggleStep(loop, "kick", 2).channels.kick).toEqual([]);
  });

  it("edits only the first note when several share a step", () => {
    const loop = twoBars([{ at: 48 }, { at: 50 }]);
    expect(setNudge(loop, "kick", 2, 4).channels.kick).toEqual([{ at: 50 }, { at: 52 }]);
    expect(getStepData(setStepData(loop, "kick", 2, { gain: 0.3 }), "kick", 2)?.gain).toBe(0.3);
  });
});
