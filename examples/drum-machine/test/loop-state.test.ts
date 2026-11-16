import { parseLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { CHANNELS, createInitialLoop, getStepData, isStepOn, setStepData, STEP_TICKS, toggleStep } from "../src/loop-state";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const onSteps = (loop: Loop, channel: string) =>
  Array.from({ length: 16 }, (_, i) => i).filter((i) => isStepOn(loop, channel, i));

describe("createInitialLoop", () => {
  const loop = createInitialLoop();

  it("is a valid loop", () => {
    expect(parseLoop(loop).ok).toBe(true);
  });

  it("is one bar of four beats at 92 bpm", () => {
    expect([loop.bars, loop.beatsPerBar, loop.tempo]).toEqual([1, 4, 92]);
  });

  it("has every channel", () => {
    expect(Object.keys(loop.channels)).toEqual([...CHANNELS]);
  });

  it("plays the starting pattern", () => {
    expect(onSteps(loop, "kick")).toEqual([0, 7, 10]);
    expect(onSteps(loop, "sd")).toEqual([4, 12]);
    expect(onSteps(loop, "chh")).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(onSteps(loop, "clap")).toEqual([]);
  });

  it("gives every note the default step data", () => {
    for (const notes of Object.values(loop.channels)) {
      for (const note of notes) expect(note.data).toEqual({ gain: 1, attack: 0 });
    }
  });
});

describe("toggleStep", () => {
  it("adds a note at the step's tick, then removes it", () => {
    const loop = createInitialLoop();
    const on = toggleStep(loop, "kick", 3);
    expect(on.channels.kick).toContainEqual({ at: 3 * STEP_TICKS, data: { gain: 1, attack: 0 } });
    expect(3 * STEP_TICKS).toBe(72);
    expect(isStepOn(on, "kick", 3)).toBe(true);

    const off = toggleStep(on, "kick", 3);
    expect(isStepOn(off, "kick", 3)).toBe(false);
    expect(off.channels.kick).toEqual(loop.channels.kick);
  });

  it("does not mutate a frozen loop", () => {
    const loop = deepFreeze(createInitialLoop());
    const snapshot = structuredClone(loop);
    expect(isStepOn(toggleStep(loop, "clap", 0), "clap", 0)).toBe(true);
    expect(isStepOn(toggleStep(loop, "kick", 0), "kick", 0)).toBe(false);
    expect(loop).toEqual(snapshot);
  });
});

describe("isStepOn", () => {
  it("is false for a channel the loop does not have", () => {
    expect(isStepOn(createInitialLoop(), "cowbell", 0)).toBe(false);
  });
});

describe("getStepData", () => {
  it("is null for an off step and the note's data for a lit one", () => {
    const loop = setStepData(createInitialLoop(), "kick", 0, { gain: 0.3 });
    expect(getStepData(loop, "kick", 1)).toBeNull();
    expect(getStepData(loop, "cowbell", 0)).toBeNull();
    expect(getStepData(loop, "kick", 0)).toEqual({ gain: 0.3, attack: 0 });
  });
});

describe("setStepData", () => {
  it("changes only that note, keeping the other field and other channels' references", () => {
    const loop = createInitialLoop();
    const next = setStepData(setStepData(loop, "kick", 0, { attack: 0.05 }), "kick", 0, { gain: 0.3 });
    expect(getStepData(next, "kick", 0)).toEqual({ gain: 0.3, attack: 0.05 });
    expect(next.channels.kick!.slice(1)).toEqual(loop.channels.kick!.slice(1));
    expect(next.channels.sd).toBe(loop.channels.sd);
    expect(next.channels.chh).toBe(loop.channels.chh);
    expect(next.channels.clap).toBe(loop.channels.clap);
  });

  it("clamps out-of-range patches", () => {
    const loop = setStepData(createInitialLoop(), "kick", 0, { gain: 9, attack: 9 });
    expect(getStepData(loop, "kick", 0)).toEqual({ gain: 1, attack: 0.1 });
    const low = setStepData(loop, "kick", 0, { gain: -9, attack: -9 });
    expect(getStepData(low, "kick", 0)).toEqual({ gain: 0, attack: 0 });
  });

  it("writes exactly gain and attack, dropping other keys", () => {
    const base = createInitialLoop();
    const loop: Loop = { ...base, channels: { ...base.channels, clap: [{ at: 0, data: { gain: 0.5, extra: "x" } }] } };
    const next = setStepData(loop, "clap", 0, { attack: 0.02 });
    expect(next.channels.clap).toEqual([{ at: 0, data: { gain: 0.5, attack: 0.02 } }]);
  });

  it("does not mutate a frozen loop", () => {
    const loop = deepFreeze(createInitialLoop());
    const snapshot = structuredClone(loop);
    expect(getStepData(setStepData(loop, "kick", 0, { gain: 0.2 }), "kick", 0)?.gain).toBe(0.2);
    expect(loop).toEqual(snapshot);
  });

  it("returns the same loop for an off step", () => {
    const loop = createInitialLoop();
    expect(setStepData(loop, "kick", 1, { gain: 0.2 })).toBe(loop);
    expect(setStepData(loop, "cowbell", 0, { gain: 0.2 })).toBe(loop);
  });

  it("returns the same loop when nothing changes", () => {
    const loop = createInitialLoop();
    expect(setStepData(loop, "kick", 0, { gain: 1 })).toBe(loop);
    expect(setStepData(loop, "kick", 0, {})).toBe(loop);
    expect(setStepData(loop, "kick", 0, { gain: 5 })).toBe(loop);
    expect(setStepData(loop, "kick", 0, { gain: NaN, attack: Infinity })).toBe(loop);
  });
});
