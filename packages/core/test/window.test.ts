import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileLoop } from "../src/compile";
import type { Loop } from "../src/loop";
import { queryWindow } from "../src/window";
import { arbLoop, deepFreeze } from "./helpers";

const loop = (over: Partial<Loop> = {}): Loop => ({
  version: 1,
  bars: 1,
  beatsPerBar: 4,
  tempo: 120,
  channels: {},
  ...over,
});

// 1 bar of 4/4 = 384 ticks.
const beat = compileLoop(
  loop({ channels: { kick: [{ at: 0 }, { at: 192 }], snare: [{ at: 96 }] } }),
);

const brief = (c: typeof beat, origin: number, from: number, to: number) =>
  queryWindow(c, origin, from, to).map(({ channel, absTick, tick }) => ({ channel, absTick, tick }));

describe("queryWindow", () => {
  it("returns one pass in time order", () => {
    expect(brief(beat, 0, 0, 384)).toEqual([
      { channel: "kick", absTick: 0, tick: 0 },
      { channel: "snare", absTick: 96, tick: 96 },
      { channel: "kick", absTick: 192, tick: 192 },
    ]);
  });

  it("is half-open", () => {
    expect(brief(beat, 0, 0, 96).map((e) => e.channel)).toEqual(["kick"]);
    expect(brief(beat, 0, 96, 97)).toEqual([{ channel: "snare", absTick: 96, tick: 96 }]);
    expect(brief(beat, 0, 96, 96)).toEqual([]);
  });

  it("wraps into the next pass", () => {
    const events = brief(beat, 0, 0, 400);
    expect(events).toHaveLength(4);
    expect(events[3]).toEqual({ channel: "kick", absTick: 384, tick: 0 });
  });

  it("spans several passes in order", () => {
    const events = queryWindow(beat, 0, 0, 1152);
    expect(events).toHaveLength(9);
    const ticks = events.map((e) => e.absTick);
    expect(ticks).toEqual([0, 96, 192, 384, 480, 576, 768, 864, 960]);
  });

  it("offsets by originTick, including windows that begin before it", () => {
    expect(brief(beat, 100, 0, 400)).toEqual([
      { channel: "kick", absTick: 100, tick: 0 },
      { channel: "snare", absTick: 196, tick: 96 },
      { channel: "kick", absTick: 292, tick: 192 },
    ]);
  });

  it("finds occurrences in negative passes", () => {
    // origin 1000: absTicks are 1000 + k*384 + at; for k = -3: -152, -56, 40.
    expect(brief(beat, 1000, -200, 100)).toEqual([
      { channel: "kick", absTick: -152, tick: 0 },
      { channel: "snare", absTick: -56, tick: 96 },
      { channel: "kick", absTick: 40, tick: 192 },
    ]);
  });

  it("returns the note itself", () => {
    const c = compileLoop(loop({ channels: { kick: [{ at: 5, duration: 10, data: { v: 1 } }] } }));
    expect(queryWindow(c, 0, 0, 10)[0]!.note).toEqual({ at: 5, duration: 10, data: { v: 1 } });
  });

  it("orders same-tick notes by channel order", () => {
    const c = compileLoop(loop({ channels: { snare: [{ at: 48 }], kick: [{ at: 48 }], hat: [{ at: 48 }] } }));
    expect(queryWindow(c, 0, 0, 384).map((e) => e.channel)).toEqual(["snare", "kick", "hat"]);
  });

  it("returns [] for an empty loop and for an empty channel", () => {
    expect(queryWindow(compileLoop(loop()), 0, 0, 1000)).toEqual([]);
    expect(queryWindow(compileLoop(loop({ channels: { kick: [] } })), 0, 0, 1000)).toEqual([]);
  });

  it("throws RangeError when from > to", () => {
    expect(() => queryWindow(beat, 0, 10, 9)).toThrow(RangeError);
  });

  it("does not mutate a frozen compiled loop", () => {
    const c = deepFreeze(compileLoop(loop({ channels: { kick: [{ at: 0 }] } })));
    expect(queryWindow(c, 0, 0, 800)).toHaveLength(3);
  });

  it("partition property: splitting [a, b) yields exactly the same events", () => {
    fc.assert(
      fc.property(
        arbLoop,
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 5 }),
        (l, origin, a, width, fractions) => {
          const c = compileLoop(l);
          const b = a + width;
          const cuts = [...new Set(fractions.map((f) => a + Math.floor(f * width)))].sort((x, y) => x - y);
          const bounds = [a, ...cuts, b];
          const parts = bounds.slice(0, -1).flatMap((lo, i) => queryWindow(c, origin, lo, bounds[i + 1]!));
          expect(parts).toEqual(queryWindow(c, origin, a, b));
        },
      ),
    );
  });

  it("matches a brute-force enumeration (no drops, no duplicates)", () => {
    fc.assert(
      fc.property(
        arbLoop,
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: 0, max: 3000 }),
        (l, origin, from, width) => {
          const c = compileLoop(l);
          const to = from + width;
          const expected: { channel: string; absTick: number; tick: number; ci: number; ni: number }[] = [];
          c.channels.forEach((ch, ci) =>
            ch.notes.forEach((note, ni) => {
              for (let k = -100; k <= 100; k++) {
                const absTick = origin + k * c.length + note.at;
                if (absTick >= from && absTick < to) expected.push({ channel: ch.id, absTick, tick: note.at, ci, ni });
              }
            }),
          );
          expected.sort((x, y) => x.absTick - y.absTick || x.ci - y.ci || x.ni - y.ni);
          expect(brief(c, origin, from, to)).toEqual(expected.map(({ ci, ni, ...e }) => e));
        },
      ),
    );
  });

  // Without the guard these loop forever (pass runs to Infinity), so they are the only tests that can hang the suite.
  it("throws RangeError for a zero-length compiled loop", () => {
    const zero = { ...beat, length: 0 };
    expect(() => queryWindow(zero, 0, 10, 20)).toThrow(RangeError);
  });

  it("throws RangeError for a negative or non-finite length", () => {
    for (const length of [-384, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => queryWindow({ ...beat, length }, 0, 10, 20)).toThrow(RangeError);
    }
  });

  it.each([
    [Number.NaN, 10],
    [0, Number.NaN],
    [0, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, 0],
    [0.5, 10],
    [0, 10.5],
  ])("throws RangeError for non-integer or non-finite bounds (%s, %s)", (from, to) => {
    expect(() => queryWindow(beat, 0, from, to)).toThrow(RangeError);
  });

  it("rejects an infinite horizon before iterating", () => {
    expect(() => queryWindow(beat, 0, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
