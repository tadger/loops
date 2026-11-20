import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { STEP_PARAMS } from "../src/params";
import type { StepParam } from "../src/params";
import { MAX_NUDGE, getDuration, getNudge, getStepData, isStepOn, setDuration, setNudge, setStepData } from "../src/loop-state";
import { testLoop } from "./fixtures";

const param = (id: StepParam["id"]) => STEP_PARAMS.find((p) => p.id === id)!;
// kick is lit at 0, 7 and 10; step 1 is off.
const ON = 7;
const OFF = 1;

describe("STEP_PARAMS", () => {
  it("lists gain, decay, length, pitch and timing with their ranges", () => {
    expect(STEP_PARAMS.map((p) => [p.id, p.min, p.max, p.step, p.defaultValue])).toEqual([
      ["gain", 0, 1, 0.01, 1],
      ["decay", 20, 2000, 10, 2000],
      ["length", 6, 384, 6, 384],
      ["pitch", -24, 12, 0.1, 0],
      ["timing", -11, 11, 1, 0],
    ]);
  });

  it("marks the octave below on pitch and leaves the other lanes on the default quarter ticks", () => {
    expect(param("pitch").ticks).toEqual([-12]);
    for (const id of ["gain", "decay", "length", "timing"] as const) expect(param(id).ticks).toBeUndefined();
  });

  it.each(STEP_PARAMS.map((p) => p.id))("%s reads null on an off step and leaves the loop alone when set", (id) => {
    const loop = testLoop();
    const p = param(id);

    expect(p.get(loop, "kick", OFF)).toBeNull();
    expect(p.set(loop, "kick", OFF, p.max)).toBe(loop);
    expect(isStepOn(loop, "kick", OFF)).toBe(false);
  });

  it("tolerates NaN and out-of-range values without throwing", () => {
    for (const p of STEP_PARAMS) {
      const loop = testLoop();
      expect(p.set(loop, "kick", ON, Number.NaN)).toBe(loop);
      expect(() => p.set(loop, "kick", ON, 1e9)).not.toThrow();
      expect(() => p.set(loop, "kick", ON, -1e9)).not.toThrow();
    }
  });

  describe("length", () => {
    const length = param("length");
    it("reads off for a plain step and the ticks for a sustained one", () => {
      const loop = testLoop();
      expect(length.get(loop, "kick", ON)).toBe(384);
      expect(length.format(384)).toBe("off");
      const held = length.set(loop, "kick", ON, 48);
      expect(length.get(held, "kick", ON)).toBe(48);
      expect(getDuration(held, "kick", ON)).toBe(48);
      expect(length.format(48)).toBe("48 ticks");
    });

    it("turns off at the top of the dial, dropping the duration", () => {
      const held = length.set(testLoop(), "kick", ON, 48);
      expect(getDuration(length.set(held, "kick", ON, 384), "kick", ON)).toBeUndefined();
    });

    it("shows an imported duration past the dial's range as the longest length, not as off", () => {
      const loop = setDuration(testLoop(), "kick", 0, 384);
      expect(length.get(loop, "kick", 0)).toBe(383);
      expect(length.format(383)).toBe("383 ticks");
    });

    it("clamps a length to the room left in the loop", () => {
      const held = length.set(testLoop(), "kick", ON, 380);
      expect(length.get(held, "kick", ON)).toBe(384 - 168);
    });
  });

  describe("gain", () => {
    const gain = param("gain");
    it("round-trips and formats as a percentage", () => {
      const loop = gain.set(testLoop(), "kick", ON, 0.8);
      expect(gain.get(loop, "kick", ON)).toBe(0.8);
      expect(getStepData(loop, "kick", ON)!.gain).toBe(0.8);
      expect(gain.format(0.8)).toBe("80%");
      expect(gain.format(1)).toBe("100%");
      expect(gain.format(0)).toBe("0%");
    });

    it("clamps to 0–1", () => {
      const loop = testLoop();
      expect(gain.get(gain.set(loop, "kick", ON, 5), "kick", ON)).toBe(1);
      expect(gain.get(gain.set(loop, "kick", ON, -5), "kick", ON)).toBe(0);
    });
  });

  describe("decay", () => {
    const decay = param("decay");
    it("is in milliseconds and stored in seconds", () => {
      const loop = decay.set(testLoop(), "kick", ON, 350);
      expect(getStepData(loop, "kick", ON)!.decay).toBe(0.35);
      expect(decay.get(loop, "kick", ON)).toBe(350);
    });

    it("reads the default for a plain note and formats 2000 as off", () => {
      expect(decay.get(testLoop(), "kick", ON)).toBe(2000);
      expect(decay.format(500)).toBe("500 ms");
      expect(decay.format(20)).toBe("20 ms");
      expect(decay.format(2000)).toBe("off");
    });

    it("clamps to 20–2000 ms", () => {
      const loop = testLoop();
      expect(decay.get(decay.set(loop, "kick", ON, 1), "kick", ON)).toBe(20);
      expect(decay.get(decay.set(loop, "kick", ON, 99999), "kick", ON)).toBe(2000);
    });
  });

  describe("pitch", () => {
    const pitch = param("pitch");
    it("converts between semitones and the stored rate", () => {
      const loop = testLoop();
      expect(pitch.get(loop, "kick", ON)).toBe(0);
      expect(getStepData(pitch.set(loop, "kick", ON, -12), "kick", ON)!.rate).toBe(0.5);
      expect(getStepData(pitch.set(loop, "kick", ON, 12), "kick", ON)!.rate).toBe(2);
      const up = pitch.set(loop, "kick", ON, 7);
      expect(pitch.get(up, "kick", ON)).toBeCloseTo(7, 3);
    });

    it("setting 0 st stores rate 1, which is the default and so leaves no data", () => {
      const down = pitch.set(testLoop(), "kick", ON, -5);
      const back = pitch.set(down, "kick", ON, 0);
      expect(pitch.get(back, "kick", ON)).toBe(0);
      expect(back.channels.kick!.find((n) => n.at === ON * 24)).toEqual({ at: ON * 24 });
    });

    it("reads an imported rate of 0.55 as about −10.35 st", () => {
      const loop = setStepData(testLoop(), "kick", ON, { rate: 0.55 });
      expect(pitch.get(loop, "kick", ON)).toBeCloseTo(-10.35, 2);
    });

    it("rounds the stored rate to 4 decimals and still reads within 0.05 st", () => {
      const rate = getStepData(pitch.set(testLoop(), "kick", ON, -10.4), "kick", ON)!.rate;
      expect(rate).toBe(Math.round(rate * 1e4) / 1e4);
      expect(String(rate).split(".")[1]!.length).toBeLessThanOrEqual(4);
      const loop = pitch.set(testLoop(), "kick", ON, -10.4);
      expect(Math.abs(pitch.get(loop, "kick", ON)! + 10.4)).toBeLessThan(0.05);
    });

    it("stores the range ends and 0 st exactly", () => {
      const loop = testLoop();
      expect(getStepData(pitch.set(loop, "kick", ON, -24), "kick", ON)!.rate).toBe(0.25);
      expect(getStepData(pitch.set(loop, "kick", ON, 12), "kick", ON)!.rate).toBe(2);
      expect(pitch.set(pitch.set(loop, "kick", ON, -5), "kick", ON, 0)).toEqual(loop);
    });

    it("clamps to the rate range, −24…12 st", () => {
      const loop = testLoop();
      expect(pitch.get(pitch.set(loop, "kick", ON, -99), "kick", ON)).toBeCloseTo(-24, 10);
      expect(pitch.get(pitch.set(loop, "kick", ON, 99), "kick", ON)).toBeCloseTo(12, 10);
    });

    it("formats with one decimal and a true minus sign", () => {
      expect(pitch.format(-10.4)).toBe("−10.4 st");
      expect(pitch.format(-10.36)).toBe("−10.4 st");
      expect(pitch.format(3)).toBe("3.0 st");
      expect(pitch.format(0)).toBe("0.0 st");
      expect(pitch.format(-0.04)).toBe("0.0 st");
    });

    it("keeps the gain already on the note", () => {
      const loop = setStepData(testLoop(), "kick", ON, { gain: 0.8 });
      const edited = pitch.set(loop, "kick", ON, -12);
      expect(getStepData(edited, "kick", ON)).toEqual({ gain: 0.8, decay: 2, rate: 0.5 });
      expect(edited.channels.kick!.find((n) => n.at === ON * 24)!.data).toEqual({ gain: 0.8, rate: 0.5 });
    });
  });

  describe("timing", () => {
    const timing = param("timing");
    it("moves the note's at and reads it back", () => {
      const loop = timing.set(testLoop(), "kick", ON, 2);
      expect(loop.channels.kick!.some((n) => n.at === ON * 24 + 2)).toBe(true);
      expect(timing.get(loop, "kick", ON)).toBe(2);
      expect(timing.get(timing.set(loop, "kick", ON, -3), "kick", ON)).toBe(-3);
    });

    it("clamps to ±11 on set", () => {
      const loop = testLoop();
      expect(timing.get(timing.set(loop, "kick", ON, 50), "kick", ON)).toBe(MAX_NUDGE);
      expect(timing.get(timing.set(loop, "kick", ON, -50), "kick", ON)).toBe(-MAX_NUDGE);
    });

    it("clamps what it reads for an imported tie, whose raw nudge is −12", () => {
      // at 36 is exactly between steps 1 and 2 and belongs to step 2.
      const loop: Loop = { ...testLoop(), channels: { kick: [{ at: 36 }] } };
      expect(getNudge(loop, "kick", 2)).toBe(-12);
      expect(timing.get(loop, "kick", 2)).toBe(-MAX_NUDGE);
    });

    it("stops a sustained note's slider at its edge without changing its duration", () => {
      const loop: Loop = { ...testLoop(), channels: { kick: [{ at: 0, duration: 95 }] } };
      expect(timing.set(loop, "kick", 0, -5)).toBe(loop);
      const late = timing.set(loop, "kick", 0, 5);
      expect(late.channels.kick).toEqual([{ at: 5, duration: 95 }]);
      expect(timing.get(late, "kick", 0)).toBe(5);
    });

    it("formats late, early and on the grid", () => {
      expect(timing.format(2)).toBe("2 ticks late");
      expect(timing.format(-3)).toBe("3 ticks early");
      expect(timing.format(1)).toBe("1 tick late");
      expect(timing.format(-1)).toBe("1 tick early");
      expect(timing.format(0)).toBe("on the grid");
    });

    it("leaves other steps alone", () => {
      const before = testLoop();
      const after = timing.set(before, "kick", ON, 4);
      expect(getNudge(after, "kick", 0)).toBe(0);
      expect(after.channels.snare).toBe(before.channels.snare);
      expect(setNudge(after, "kick", ON, 0)).toEqual(before);
    });
  });

  it("tolerates garbage and legacy data on the note", () => {
    const loop = {
      ...testLoop(),
      channels: { kick: [{ at: 0, data: "loud" }, { at: 24, data: { gain: "x", rate: [] } }, { at: 48, data: null }] },
    } as Loop;
    for (const step of [0, 1, 2]) {
      expect(param("gain").get(loop, "kick", step)).toBe(1);
      expect(param("decay").get(loop, "kick", step)).toBe(2000);
      expect(param("pitch").get(loop, "kick", step)).toBe(0);
      expect(param("timing").get(loop, "kick", step)).toBe(0);
    }
  });
});
