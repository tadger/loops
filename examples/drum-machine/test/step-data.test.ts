import { describe, expect, it } from "vitest";
import { clampStepData, DECAY_MAX, DECAY_MIN, DEFAULT_STEP_DATA, RATE_MAX, RATE_MIN, readStepData } from "../src/step-data";

const read = (data: unknown) => readStepData({ at: 0, data: data as never });

describe("readStepData", () => {
  it("defaults when the note has no data", () => {
    expect(readStepData({ at: 0 })).toEqual({ gain: 1, decay: DECAY_MAX, rate: 1 });
    expect(DEFAULT_STEP_DATA).toEqual({ gain: 1, decay: 2, rate: 1 });
    expect([DECAY_MIN, DECAY_MAX, RATE_MIN, RATE_MAX]).toEqual([0.02, 2, 0.25, 2]);
  });

  it("reads gain, decay and rate", () => {
    expect(read({ gain: 0.4, decay: 0.3, rate: 0.5 })).toEqual({ gain: 0.4, decay: 0.3, rate: 0.5 });
  });

  it("clamps out-of-range values", () => {
    expect(read({ gain: 5 }).gain).toBe(1);
    expect(read({ gain: -1 }).gain).toBe(0);
    expect(read({ decay: 0 }).decay).toBe(DECAY_MIN);
    expect(read({ decay: 9 }).decay).toBe(DECAY_MAX);
    expect(read({ rate: 9 }).rate).toBe(RATE_MAX);
    expect(read({ rate: 0 }).rate).toBe(RATE_MIN);
  });

  it("falls back to the defaults for malformed data without throwing", () => {
    const bad = [null, [1], "x", 7, true, { gain: "loud" }, { gain: NaN }, { gain: Infinity }, { decay: "slow" }, { decay: NaN }, { rate: [] }, { rate: NaN }];
    for (const data of bad) expect(read(data)).toEqual(DEFAULT_STEP_DATA);
  });

  it("keeps the default for a missing field", () => {
    expect(read({ gain: 0.5 })).toEqual({ gain: 0.5, decay: DECAY_MAX, rate: 1 });
    expect(read({ rate: 0.5 })).toEqual({ gain: 1, decay: DECAY_MAX, rate: 0.5 });
  });

  it("ignores an old attack key", () => {
    expect(read({ gain: 0.5, attack: 0.05 })).toEqual({ gain: 0.5, decay: DECAY_MAX, rate: 1 });
  });
});

describe("clampStepData", () => {
  it("clamps every field", () => {
    expect(clampStepData({ gain: 5, decay: 0, rate: 9 })).toEqual({ gain: 1, decay: DECAY_MIN, rate: RATE_MAX });
    expect(clampStepData({ gain: -5, decay: 9, rate: 0 })).toEqual({ gain: 0, decay: DECAY_MAX, rate: RATE_MIN });
  });
});
