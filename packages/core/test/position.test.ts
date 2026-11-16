import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatPos, parsePos, pos } from "../src/position";

const M = { beatsPerBar: 4 };

describe("position", () => {
  it("parses bar.beat.tick positions to ticks", () => {
    expect(pos("1.1.01", M)).toBe(0);
    expect(pos("1.2.01", M)).toBe(96);
    expect(pos("2.1.01", M)).toBe(384);
    expect(pos("1.1.25", M)).toBe(24);
  });

  it("formats ticks as bar.beat.tick", () => {
    expect(formatPos(0, M)).toBe("1.1.01");
    expect(formatPos(96, M)).toBe("1.2.01");
    expect(formatPos(24, M)).toBe("1.1.25");
  });

  it("rejects malformed input", () => {
    for (const text of ["x1.2.3y", "1.2.3.4", "1.1", "", "1.1.1", "0.1.01", "1.0.01", "1.1.00", "1.1.97", "1.5.01"]) {
      const result = parsePos(text, M);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).not.toBe("");
      expect(() => pos(text, M)).toThrow(RangeError);
    }
  });

  it("round-trips every tick", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }).chain((beatsPerBar) =>
          fc.record({
            beatsPerBar: fc.constant(beatsPerBar),
            tick: fc.integer({ min: 0, max: 4 * beatsPerBar * 96 - 1 }),
          }),
        ),
        ({ beatsPerBar, tick }) => {
          const m = { beatsPerBar };
          return pos(formatPos(tick, m), m) === tick;
        },
      ),
    );
  });

  it("formatPos rejects negative or fractional ticks", () => {
    expect(() => formatPos(-1, M)).toThrow(RangeError);
    expect(() => formatPos(1.5, M)).toThrow(RangeError);
    expect(() => formatPos(Number.NaN, M)).toThrow(RangeError);
  });
});
