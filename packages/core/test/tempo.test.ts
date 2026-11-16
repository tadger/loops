import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAnchor, reanchor, tickAt, timeAt, ticksToSeconds } from "../src/tempo";

describe("tempo", () => {
  it("maps ticks to time and back from an anchor", () => {
    const a = createAnchor(0, 10, 120);
    expect(timeAt(a, 96)).toBe(10.5);
    expect(tickAt(a, 10.5)).toBe(96);
    expect(ticksToSeconds(96, 120)).toBe(0.5);
  });

  it("reanchors at a new tempo without mutating the original", () => {
    const a = createAnchor(0, 10, 120);
    const b = reanchor(a, 96, 60);
    expect(timeAt(b, 96)).toBe(10.5);
    expect(timeAt(b, 192)).toBe(11.5);
    expect(timeAt(a, 96)).toBe(10.5);
    expect(b).toEqual({ tick: 96, time: 10.5, bpm: 60 });
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (anchorTick, anchorTime, bpm, tick) => {
          const a = createAnchor(anchorTick, anchorTime, bpm);
          expect(Math.abs(tickAt(a, timeAt(a, tick)) - tick)).toBeLessThan(1e-9);
        },
      ),
    );
  });

  it("freezes anchors", () => {
    const a = createAnchor(0, 0, 120);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(reanchor(a, 96, 90))).toBe(true);
  });

  it("rejects non-positive or non-finite bpm", () => {
    const a = createAnchor(0, 0, 120);
    for (const bpm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => createAnchor(0, 0, bpm)).toThrow(RangeError);
      expect(() => reanchor(a, 96, bpm)).toThrow(RangeError);
      expect(() => ticksToSeconds(96, bpm)).toThrow(RangeError);
    }
    const bad = { tick: 0, time: 0, bpm: 0 };
    expect(() => timeAt(bad, 1)).toThrow(RangeError);
    expect(() => tickAt(bad, 1)).toThrow(RangeError);
  });
});
