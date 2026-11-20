import { parseLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import {
  addBar,
  getDuration,
  getNudge,
  getStepData,
  isStepOn,
  MAX_NUDGE,
  nudgeOf,
  removeBar,
  setDuration,
  setNudge,
  setStepData,
  stepCount,
  stepOf,
  stepsInBar,
  stepsPerBar,
  STEP_TICKS,
  toggleStep,
} from "../src/loop-state";
import { createBoomBapLoop } from "../src/beats";
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

  describe("a sustained note", () => {
    const valid = (loop: Loop) => expect(parseLoop(loop).ok).toBe(true);

    it("cannot be nudged early from step 0, so it never wraps", () => {
      const loop = twoBars([{ at: 0, duration: 95 }]);
      expect(setNudge(loop, "kick", 0, -1)).toBe(loop);
      expect(setNudge(loop, "kick", 0, -7)).toBe(loop);
    });

    it("moves late with its duration intact", () => {
      const next = setNudge(twoBars([{ at: 0, duration: 95 }]), "kick", 0, 5);
      expect(next.channels.kick).toEqual([{ at: 5, duration: 95 }]);
      valid(next);
    });

    it("keeps its exact duration through a nudge there and back", () => {
      let loop = twoBars([{ at: 0, duration: 95 }]);
      for (const nudge of [-1, -3, 2, 5, 0, -3, 0]) {
        loop = setNudge(loop, "kick", 0, nudge);
        expect(loop.channels.kick![0]!.duration).toBe(95);
        valid(loop);
      }
      expect(loop.channels.kick).toEqual([{ at: 0, duration: 95 }]);
    });

    it("stops late nudges where the note still fits the loop", () => {
      const bass = setNudge(twoBars([{ at: 722, duration: 40 }]), "kick", 30, 11);
      expect(bass.channels.kick).toEqual([{ at: 728, duration: 40 }]);
      valid(bass);
      const early = setNudge(bass, "kick", 30, -11);
      expect(early.channels.kick).toEqual([{ at: 709, duration: 40 }]);

      const string = twoBars([{ at: 746, duration: 22 }]);
      expect(setNudge(string, "kick", 31, 11)).toBe(string);
      expect(setNudge(string, "kick", 31, 3)).toBe(string);
      const earlier = setNudge(string, "kick", 31, -4);
      expect(earlier.channels.kick).toEqual([{ at: 740, duration: 22 }]);
      valid(earlier);
    });

    it("stays well defined for an imported note outside its own range", () => {
      const overrun = twoBars([{ at: 744, duration: 60 }]);
      expect(setNudge(overrun, "kick", 31, 5)).toBe(overrun);
      expect(setNudge(overrun, "kick", 31, -5)).toBe(overrun);

      const wrapped = twoBars([{ at: 761, duration: 7 }]);
      const back = setNudge(wrapped, "kick", 0, 3);
      expect(back.channels.kick).toEqual([{ at: 3, duration: 7 }]);
      valid(back);
    });

    it("leaves a one-shot free to wrap", () => {
      const next = setNudge(twoBars([{ at: 0 }]), "kick", 0, -7);
      expect(next.channels.kick).toEqual([{ at: 761 }]);
      valid(next);
    });
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

describe("bars", () => {
  const BAR = 16 * STEP_TICKS;
  const barsLoop = (bars: number, channels: Loop["channels"]): Loop => ({ ...testLoop(), bars, channels });
  const on = (stepNumbers: number[]) => stepNumbers.map((step) => ({ at: step * STEP_TICKS }));

  it("addBar appends an empty bar and leaves every note where it was", () => {
    const loop = barsLoop(1, { kick: on([0, 7]), snare: on([4]) });
    const next = addBar(loop);
    expect(next.bars).toBe(2);
    expect(next.channels).toEqual(loop.channels);
  });

  it("addBar keeps a first-beat step nudged early on step 0", () => {
    const loop = setNudge(barsLoop(1, { kick: on([0]) }), "kick", 0, -5);
    expect(loop.channels.kick![0]!.at).toBe(BAR - 5);
    const next = addBar(loop);
    expect(isStepOn(next, "kick", 0)).toBe(true);
    expect(getNudge(next, "kick", 0)).toBe(-5);
    expect(next.channels.kick![0]!.at).toBe(2 * BAR - 5);
  });

  it("removeBar on the last bar deletes only that bar's steps", () => {
    const next = removeBar(barsLoop(2, { kick: on([0, 3, 16, 20]) }), 1);
    expect(next.bars).toBe(1);
    expect(next.channels.kick).toEqual(on([0, 3]));
  });

  it("removeBar shifts later bars left by one bar", () => {
    const next = removeBar(barsLoop(2, { kick: on([1, 19]) }), 0);
    expect(next.bars).toBe(1);
    expect(next.channels.kick).toEqual(on([3]));
  });

  it("removeBar keeps a nudged step's nudge when it shifts, wrapping an early first-beat step to the end", () => {
    const loop = barsLoop(2, { kick: [{ at: BAR + 5 }], snare: [{ at: BAR - 5 }, { at: BAR }] });
    const next = removeBar(loop, 0);
    expect(next.channels.kick).toEqual([{ at: 5 }]);
    expect(next.channels.snare).toEqual([{ at: 0 }, { at: BAR - 5 }]);
  });

  it("removeBar drops a wrapped early-nudged step 0 when bar 0 is removed", () => {
    const next = removeBar(barsLoop(2, { kick: [{ at: BAR }, { at: 2 * BAR - 5 }] }), 0);
    expect(next.channels.kick).toEqual([{ at: 0 }]);
  });

  it("removeBar keeps a wrapped step 0 at the end of the shorter loop when a later bar is removed", () => {
    const next = removeBar(barsLoop(2, { kick: [{ at: 2 * BAR - 5 }] }), 1);
    expect(next.channels.kick).toEqual([{ at: BAR - 5 }]);
  });

  it("removeBar clamps a sustained note that would pass the new loop end", () => {
    const loop = barsLoop(3, { kick: [{ at: 0, duration: 2.5 * BAR }, { at: 0, duration: BAR }] });
    const next = removeBar(loop, 2);
    expect(next.channels.kick).toEqual([
      { at: 0, duration: 2 * BAR },
      { at: 0, duration: BAR },
    ]);
  });

  it("removeBar keeps a sustained note whole when its early nudge would wrap it, dropping the nudge instead", () => {
    const next = removeBar(barsLoop(2, { kick: [{ at: BAR - 5, duration: 60 }] }), 0);
    expect(next.channels.kick).toEqual([{ at: 0, duration: 60 }]);
  });

  it("removeBar leaves the default beat's sustained notes at their full duration and the loop valid", () => {
    const next = removeBar(createBoomBapLoop(), 0);
    expect(next.channels.plong2!.map((note) => note.duration)).toEqual([60, 60]);
    expect(parseLoop(JSON.parse(JSON.stringify(next))).ok).toBe(true);
  });

  it("removeBar returns the same loop for the last remaining bar, a negative index, a fractional index or one past the end", () => {
    const one = barsLoop(1, { kick: on([0]) });
    expect(removeBar(one, 0)).toBe(one);
    const two = barsLoop(2, { kick: on([0]) });
    for (const index of [-1, 2, 0.5, Number.NaN]) expect(removeBar(two, index)).toBe(two);
  });

  it("removeBar keeps channels with no notes and channels outside CHANNELS, in order", () => {
    const next = removeBar(barsLoop(2, { kick: on([0]), bass: [], extra: on([17]) }), 0);
    expect(Object.keys(next.channels)).toEqual(["kick", "bass", "extra"]);
    expect(next.channels.bass).toEqual([]);
    expect(next.channels.extra).toEqual(on([1]));
  });

  it("addBar then removeBar on the new last bar returns an equal loop", () => {
    const loop = barsLoop(2, { kick: on([0, 17]), snare: [{ at: 2 * BAR - 5 }] });
    expect(removeBar(addBar(loop), 2)).toEqual(loop);
  });

  it("does not mutate its input", () => {
    const loop = deepFreeze(barsLoop(2, { kick: on([0, 17]), snare: [{ at: 2 * BAR - 5 }] }));
    expect(() => addBar(loop)).not.toThrow();
    expect(() => removeBar(loop, 0)).not.toThrow();
  });

  it("stepsInBar counts each channel's step once, per bar, including a wrapped step 0 in bar 0", () => {
    const loop = barsLoop(2, {
      kick: [...on([0, 3]), { at: 3 * STEP_TICKS }, { at: 2 * BAR - 5 }],
      snare: on([3, 20]),
    });
    expect(stepsInBar(loop, 0)).toBe(3);
    expect(stepsInBar(loop, 1)).toBe(1);
    expect(stepsInBar(loop, 2)).toBe(0);
  });
});

describe("duration", () => {
  // kick is lit at steps 0, 7 and 10 of a 384-tick bar; step 7 starts at tick 168.
  const sustained = (duration: number) => setDuration(testLoop(), "kick", 7, duration);

  it("reads null on an off step, undefined on a plain step and the ticks on a sustained one", () => {
    expect(getDuration(testLoop(), "kick", 1)).toBeNull();
    expect(getDuration(testLoop(), "kick", 7)).toBeUndefined();
    expect(getDuration(sustained(40), "kick", 7)).toBe(40);
  });

  it("holds a note for the given ticks without touching its position or data", () => {
    const loop = setStepData(testLoop(), "kick", 7, { gain: 0.5 });
    const next = setDuration(loop, "kick", 7, 40);
    expect(next.channels.kick!.find((n) => n.at === 168)).toEqual({ at: 168, duration: 40, data: { gain: 0.5 } });
    expect(parseLoop(next).ok).toBe(true);
  });

  it("rounds to whole ticks and keeps at least one", () => {
    expect(getDuration(sustained(40.6), "kick", 7)).toBe(41);
    expect(getDuration(sustained(-5), "kick", 7)).toBe(1);
  });

  it("stops at the loop's end, so the note still fits", () => {
    expect(getDuration(sustained(9999), "kick", 7)).toBe(384 - 168);
    expect(parseLoop(sustained(9999)).ok).toBe(true);
  });

  it("removes the duration when given undefined, so the whole sample plays", () => {
    const back = setDuration(sustained(40), "kick", 7, undefined);
    expect(back.channels.kick).toEqual(testLoop().channels.kick);
  });

  it("returns the same loop for an off step, a missing channel, NaN or no change", () => {
    const loop = sustained(40);
    expect(setDuration(loop, "kick", 1, 40)).toBe(loop);
    expect(setDuration(loop, "cowbell", 7, 40)).toBe(loop);
    expect(setDuration(loop, "kick", 7, Number.NaN)).toBe(loop);
    expect(setDuration(loop, "kick", 7, 40)).toBe(loop);
    const plain = testLoop();
    expect(setDuration(plain, "kick", 7, undefined)).toBe(plain);
  });

  it("does not mutate its input", () => {
    const loop = deepFreeze(testLoop());
    expect(() => setDuration(loop, "kick", 7, 40)).not.toThrow();
  });

  it("is kept when the step's other data changes", () => {
    const next = setStepData(sustained(40), "kick", 7, { decay: 0.1 });
    expect(getDuration(next, "kick", 7)).toBe(40);
  });
});
