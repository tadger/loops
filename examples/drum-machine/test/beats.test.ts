import { parseLoop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { createBoomBapLoop } from "../src/beats";
import { CHANNELS, nudgeOf, stepOf } from "../src/loop-state";

// bar.beat.tick, 1-based, 96 ticks to a beat in 4/4.
const tick = (bar: number, beat: number, t: number) => ((bar - 1) * 4 + (beat - 1)) * 96 + (t - 1);

interface Expected {
  at: number;
  duration?: number;
  data?: { gain?: number; rate?: number };
}

type Row = [bar: number, beat: number, t: number, extra?: { d?: number; g?: number; r?: number }];

const note = ([bar, beat, t, extra = {}]: Row): Expected => {
  const data: Expected["data"] = {};
  if (extra.g !== undefined) data.gain = extra.g;
  if (extra.r !== undefined) data.rate = extra.r;
  return {
    at: tick(bar, beat, t),
    ...(extra.d !== undefined && { duration: extra.d }),
    ...(Object.keys(data).length > 0 && { data }),
  };
};

const hihatBar = (bar: number): Row[] => [
  [bar, 1, 1, { g: 0.7 }],
  [bar, 2, 1, { g: 0.8 }],
  [bar, 3, 1, { g: 0.7 }],
  [bar, 4, 1, { g: 0.8 }],
  [bar, 4, 53, { g: 0.6 }],
];

const BEAT: Record<(typeof CHANNELS)[number], Row[]> = {
  kick: [
    [1, 1, 1],
    [1, 1, 51, { g: 0.8 }],
    [1, 2, 88],
    [1, 3, 75],
    [1, 4, 72, { g: 0.8 }],
    [2, 1, 51, { g: 0.7 }],
    [2, 3, 51, { g: 0.8 }],
    [2, 3, 88],
  ],
  snare: [
    [1, 1, 91],
    [1, 3, 91],
    [2, 1, 91],
    [2, 4, 3],
  ],
  hihat: [...hihatBar(1), ...hihatBar(2)],
  plong1: [[1, 1, 1, { d: 95 }]],
  plong2: [
    [1, 4, 90, { d: 60, g: 0.4 }],
    [2, 1, 52, { d: 60, g: 0.7 }],
  ],
  string1: [
    [1, 3, 75, { d: 90, g: 0.6 }],
    [1, 4, 52, { d: 90, g: 0.2 }],
    [2, 3, 25, { d: 70, g: 0.6 }],
    [2, 4, 1, { d: 85, g: 0.3 }],
    [2, 4, 75, { d: 22, g: 0.1 }],
  ],
  string2: [[2, 2, 50, { d: 70, g: 0.6 }]],
  string3: [
    [1, 2, 5, { d: 45, g: 0.6 }],
    [1, 2, 51, { d: 45, g: 0.4 }],
    [1, 3, 5, { d: 45, g: 0.2 }],
    [1, 3, 51, { d: 45, g: 0.05 }],
    [2, 2, 5, { d: 45, g: 0.6 }],
  ],
  bass: [
    [1, 1, 1, { d: 60, g: 0.8, r: 0.55 }],
    [1, 2, 72, { d: 15, g: 0.5, r: 0.55 }],
    [1, 3, 2, { d: 40, g: 0.8, r: 0.55 }],
    [1, 4, 1, { d: 40, g: 0.6, r: 0.64 }],
    [1, 4, 51, { d: 100, g: 0.8, r: 0.74 }],
    [2, 3, 51, { d: 60, g: 0.8, r: 0.46 }],
    [2, 4, 51, { d: 40, g: 0.8, r: 0.52 }],
  ],
};

describe("createBoomBapLoop", () => {
  const loop = createBoomBapLoop();

  it("is a valid loop", () => {
    expect(parseLoop(loop).ok).toBe(true);
  });

  it("is two bars of four beats at 88 bpm", () => {
    expect([loop.bars, loop.beatsPerBar, loop.tempo]).toEqual([2, 4, 88]);
  });

  it("has exactly the kit's channels", () => {
    expect(Object.keys(loop.channels).sort()).toEqual([...CHANNELS].sort());
  });

  for (const channel of CHANNELS) {
    it(`${channel} has his notes, durations, gains and rates`, () => {
      const expected = BEAT[channel].map(note).sort((a, b) => a.at - b.at);
      const actual = [...loop.channels[channel]!].sort((a, b) => a.at - b.at);
      expect(actual).toEqual(expected);
    });

    it(`${channel} has one note per step, within the nudge range`, () => {
      const notes = loop.channels[channel]!;
      expect(new Set(notes.map((n) => stepOf(loop, n.at))).size).toBe(notes.length);
      for (const n of notes) expect(Math.abs(nudgeOf(n.at))).toBeLessThanOrEqual(9);
    });
  }

  it("trims the last string1 note so it ends at the loop's end", () => {
    const last = loop.channels.string1!.at(-1)!;
    expect(last.duration).toBe(22);
    expect(last.at + last.duration!).toBe(768);
  });

  it("returns a fresh, equal loop each call", () => {
    const again = createBoomBapLoop();
    expect(again).toEqual(loop);
    expect(again).not.toBe(loop);
    expect(again.channels).not.toBe(loop.channels);
  });
});
