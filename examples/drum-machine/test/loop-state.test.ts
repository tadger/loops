import { parseLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { CHANNELS, createInitialLoop, isStepOn, STEP_TICKS, toggleStep } from "../src/loop-state";

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

  it("gives every note a gain", () => {
    for (const notes of Object.values(loop.channels)) {
      for (const note of notes) expect(note.data).toEqual({ gain: 1 });
    }
  });
});

describe("toggleStep", () => {
  it("adds a note at the step's tick, then removes it", () => {
    const loop = createInitialLoop();
    const on = toggleStep(loop, "kick", 3);
    expect(on.channels.kick).toContainEqual({ at: 3 * STEP_TICKS, data: { gain: 1 } });
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
