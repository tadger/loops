import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileLoop } from "../src/compile";
import { loopLength } from "../src/loop";
import type { Loop } from "../src/loop";
import { resize } from "../src/loop-edit";
import { arbLoop, deepFreeze } from "./helpers";

const loop = (over: Partial<Loop> = {}): Loop => ({
  version: 1,
  bars: 1,
  beatsPerBar: 4,
  tempo: 120,
  channels: {},
  ...over,
});

describe("compileLoop", () => {
  it("computes length as bars * beatsPerBar * 96 and carries tempo and the source loop", () => {
    const l = loop({ bars: 2, beatsPerBar: 3, tempo: 90 });
    const c = compileLoop(l);
    expect(c.length).toBe(2 * 3 * 96);
    expect(c.tempo).toBe(90);
    expect(c.loop).toBe(l);
  });

  it("agrees with loopLength for any loop", () => {
    fc.assert(fc.property(arbLoop, (l) => compileLoop(l).length === loopLength(l)));
  });

  it("lists channels in Object.keys order", () => {
    const l = loop({ channels: { snare: [], kick: [{ at: 0 }], hat: [] } });
    expect(compileLoop(l).channels.map((c) => c.id)).toEqual(["snare", "kick", "hat"]);
  });

  it("sorts notes by `at`, stably, without mutating the input", () => {
    const l = loop({
      channels: {
        kick: [
          { at: 48, data: "a" },
          { at: 0, data: "b" },
          { at: 48, data: "c" },
          { at: 24, data: "d" },
        ],
      },
    });
    const c = compileLoop(l);
    expect(c.channels[0]?.notes.map((n) => n.data)).toEqual(["b", "d", "a", "c"]);
    expect(l.channels.kick?.map((n) => n.data)).toEqual(["a", "b", "c", "d"]);
  });

  it("is memoized by object identity", () => {
    const l = loop({ channels: { kick: [{ at: 0 }] } });
    expect(compileLoop(l)).toBe(compileLoop(l));
  });

  it("does not share results between equal-content loop objects", () => {
    const a = loop({ channels: { kick: [{ at: 0 }] } });
    const b = loop({ channels: { kick: [{ at: 0 }] } });
    expect(compileLoop(a)).not.toBe(compileLoop(b));
    expect(compileLoop(a)).toEqual({ ...compileLoop(b), loop: a });
  });

  it("accepts a deeply frozen loop", () => {
    const l = deepFreeze(loop({ channels: { kick: [{ at: 48 }, { at: 0 }] } }));
    expect(() => compileLoop(l)).not.toThrow();
    expect(compileLoop(l).channels[0]?.notes.map((n) => n.at)).toEqual([0, 48]);
  });

  it("handles channel ids like __proto__ as plain data", () => {
    const channels = JSON.parse('{"__proto__": [{"at": 1}, {"at": 0}]}');
    const c = compileLoop(loop({ channels }));
    expect(c.channels).toHaveLength(1);
    expect(c.channels[0]?.id).toBe("__proto__");
    expect(c.channels[0]?.notes.map((n) => n.at)).toEqual([0, 1]);
  });

  it("recompiles to the new length after resize changes beatsPerBar", () => {
    const l = loop({ channels: { kick: [{ at: 0 }] } });
    expect(compileLoop(l).length).toBe(384);
    const { loop: resized } = resize(l, { beatsPerBar: 3 });
    expect(compileLoop(resized).length).toBe(288);
    expect(compileLoop(l).length).toBe(384);
  });
});
