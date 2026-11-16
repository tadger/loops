import { describe, expect, it } from "vitest";
import { ATTACK_MAX, DEFAULT_STEP_DATA, readStepData } from "../src/step-data";

describe("readStepData", () => {
  it("defaults when the note has no data", () => {
    expect(readStepData({ at: 0 })).toEqual({ gain: 1, attack: 0 });
    expect(DEFAULT_STEP_DATA).toEqual({ gain: 1, attack: 0 });
  });

  it("reads gain and attack", () => {
    expect(readStepData({ at: 0, data: { gain: 0.4, attack: 0.05 } })).toEqual({ gain: 0.4, attack: 0.05 });
  });

  it("clamps out-of-range values", () => {
    expect(readStepData({ at: 0, data: { gain: 2 } }).gain).toBe(1);
    expect(readStepData({ at: 0, data: { gain: -1 } }).gain).toBe(0);
    expect(readStepData({ at: 0, data: { attack: 5 } }).attack).toBe(ATTACK_MAX);
    expect(readStepData({ at: 0, data: { attack: -1 } }).attack).toBe(0);
  });

  it("falls back to the defaults for malformed data without throwing", () => {
    for (const data of [null, [1], "x", 7, true, { gain: "loud" }, { gain: NaN }, { gain: Infinity }, { attack: "slow" }, { attack: NaN }]) {
      expect(readStepData({ at: 0, data: data as never })).toEqual(DEFAULT_STEP_DATA);
    }
  });

  it("keeps the default for a missing field", () => {
    expect(readStepData({ at: 0, data: { gain: 0.5 } })).toEqual({ gain: 0.5, attack: 0 });
    expect(readStepData({ at: 0, data: { attack: 0.02 } })).toEqual({ gain: 1, attack: 0.02 });
  });
});
