import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loopLength, parseLoop } from "../src/loop";
import type { Loop } from "../src/loop";
import {
  addNote,
  clearChannel,
  removeNotes,
  resize,
  setChannel,
  setTempo,
  steps,
  toggleNote,
} from "../src/loop-edit";
import { arbLoop, deepFreeze } from "./helpers";

function makeLoop(): Loop {
  return {
    version: 1,
    bars: 2,
    beatsPerBar: 4,
    tempo: 92,
    channels: {
      kick: [{ at: 0, duration: 24, data: { gain: 1 } }, { at: 192 }],
      snare: [{ at: 96 }, { at: 288 }],
    },
  };
}

describe("edit helpers never mutate their input", () => {
  const edits: Array<[string, (l: Loop) => Loop]> = [
    ["toggleNote (add)", (l) => toggleNote(l, "kick", 48, { duration: 12, data: { gain: 2 } })],
    ["toggleNote (remove)", (l) => toggleNote(l, "kick", 0)],
    ["toggleNote (new channel)", (l) => toggleNote(l, "hat", 0)],
    ["addNote", (l) => addNote(l, "snare", { at: 10, data: [1] })],
    ["removeNotes", (l) => removeNotes(l, "snare", 96)],
    ["setChannel", (l) => setChannel(l, "kick", [{ at: 5 }, { at: 1 }])],
    ["clearChannel", (l) => clearChannel(l, "kick")],
    ["setTempo", (l) => setTempo(l, 140)],
    ["resize", (l) => resize(l, { bars: 1 }).loop],
  ];

  it.each(edits)("%s", (_name, edit) => {
    const input = deepFreeze(makeLoop());
    const result = edit(input);
    expect(input).toEqual(makeLoop());
    expect(result).not.toBe(input);
  });

  it("does not alias caller-supplied notes in the result", () => {
    const note = { at: 3, data: { gain: 1 } };
    const result = addNote(makeLoop(), "kick", note);
    const stored = result.channels.kick!.find((n) => n.at === 3)!;
    expect(stored).toEqual(note);
    expect(stored).not.toBe(note);
    expect(stored.data).not.toBe(note.data);
  });
});

describe("no-ops return the same loop object", () => {
  it("removeNotes with nothing to remove", () => {
    const l = makeLoop();
    expect(removeNotes(l, "kick", 7)).toBe(l);
    expect(removeNotes(l, "missing", 0)).toBe(l);
  });

  it("setTempo to the current tempo", () => {
    const l = makeLoop();
    expect(setTempo(l, 92)).toBe(l);
  });

  it("clearChannel on an already empty channel", () => {
    const l = clearChannel(makeLoop(), "kick");
    expect(clearChannel(l, "kick")).toBe(l);
  });

  it("resize to the current size", () => {
    const l = makeLoop();
    const r = resize(l, { bars: 2, beatsPerBar: 4 });
    expect(r.loop).toBe(l);
    expect(r.dropped).toEqual([]);
    expect(resize(l, {}).loop).toBe(l);
  });
});

it("keeps untouched channels by reference", () => {
  const l = makeLoop();
  expect(toggleNote(l, "kick", 0).channels.snare).toBe(l.channels.snare);
  expect(addNote(l, "kick", { at: 1 }).channels.snare).toBe(l.channels.snare);
  expect(removeNotes(l, "kick", 0).channels.snare).toBe(l.channels.snare);
  expect(setChannel(l, "kick", []).channels.snare).toBe(l.channels.snare);
  expect(clearChannel(l, "kick").channels.snare).toBe(l.channels.snare);
  expect(setTempo(l, 100).channels.snare).toBe(l.channels.snare);
  const grown = resize(l, { bars: 3 }).loop;
  expect(grown.channels.kick).toBe(l.channels.kick);
  expect(grown.channels.snare).toBe(l.channels.snare);
  const shrunk = resize(l, { bars: 1 }).loop; // length 384: every note still fits
  expect(shrunk.channels.kick).toBe(l.channels.kick);
  expect(shrunk.channels.snare).toBe(l.channels.snare);
  const trimmed = resize({ ...l, channels: { ...l.channels, snare: [{ at: 400 }] } }, { bars: 1 }).loop;
  expect(trimmed.channels.snare).toEqual([]);
  expect(trimmed.channels.kick).toBe(l.channels.kick);
});

describe("toggleNote", () => {
  it("adds when absent, keeping notes sorted by at", () => {
    const r = toggleNote(makeLoop(), "kick", 100);
    expect(r.channels.kick!.map((n) => n.at)).toEqual([0, 100, 192]);
  });

  it("removes every note at (channel, at) when present", () => {
    const l: Loop = { ...makeLoop(), channels: { kick: [{ at: 0 }, { at: 0, duration: 4 }, { at: 96 }] } };
    expect(toggleNote(l, "kick", 0).channels.kick).toEqual([{ at: 96 }]);
  });

  it("applies the note payload when adding", () => {
    const r = toggleNote(makeLoop(), "kick", 48, { duration: 24, data: { gain: 1 } });
    expect(r.channels.kick![1]).toEqual({ at: 48, duration: 24, data: { gain: 1 } });
  });

  it("creates an unknown channel", () => {
    const r = toggleNote(makeLoop(), "hat", 12);
    expect(r.channels.hat).toEqual([{ at: 12 }]);
  });

  it("creates and finds a channel called __proto__ as plain data", () => {
    const added = toggleNote(makeLoop(), "__proto__", 12);
    expect(Object.getPrototypeOf(added.channels)).toBe(Object.prototype);
    expect(Object.keys(added.channels)).toContain("__proto__");
    expect(toggleNote(added, "__proto__", 12).channels.__proto__).toEqual([]);
  });

  it("throws RangeError for at outside [0, length)", () => {
    const l = makeLoop();
    expect(() => toggleNote(l, "kick", -1)).toThrow(RangeError);
    expect(() => toggleNote(l, "kick", 768)).toThrow(RangeError);
    expect(() => toggleNote(l, "kick", 1.5)).toThrow(RangeError);
    expect(() => toggleNote(l, "kick", 767)).not.toThrow();
  });

  it("throws RangeError for an invalid payload or channel id", () => {
    const l = makeLoop();
    expect(() => toggleNote(l, "kick", 700, { duration: 100 })).toThrow(RangeError);
    expect(() => toggleNote(l, "kick", 48, { duration: 0 })).toThrow(RangeError);
    expect(() => toggleNote(l, "", 0)).toThrow(RangeError);
  });

  it("ignores the payload when removing", () => {
    expect(toggleNote(makeLoop(), "kick", 0, { duration: 0 }).channels.kick).toEqual([{ at: 192 }]);
  });
});

describe("addNote", () => {
  it("inserts sorted and allows several notes at one tick", () => {
    const r = addNote(addNote(makeLoop(), "kick", { at: 96 }), "kick", { at: 96, duration: 4 });
    expect(r.channels.kick!.map((n) => n.at)).toEqual([0, 96, 96, 192]);
  });

  it("throws RangeError for at out of range or at + duration > length", () => {
    const l = makeLoop();
    expect(() => addNote(l, "kick", { at: -1 })).toThrow(RangeError);
    expect(() => addNote(l, "kick", { at: 768 })).toThrow(RangeError);
    expect(() => addNote(l, "kick", { at: 700, duration: 69 })).toThrow(RangeError);
    expect(() => addNote(l, "kick", { at: 700, duration: 68 })).not.toThrow();
    expect(() => addNote(l, "", { at: 0 })).toThrow(RangeError);
  });
});

describe("setChannel", () => {
  it("sorts the notes and creates the channel if needed", () => {
    const r = setChannel(makeLoop(), "hat", [{ at: 48 }, { at: 0 }, { at: 24 }]);
    expect(r.channels.hat!.map((n) => n.at)).toEqual([0, 24, 48]);
  });

  it("throws RangeError for at out of range or at + duration > length", () => {
    const l = makeLoop();
    expect(() => setChannel(l, "kick", [{ at: 0 }, { at: 768 }])).toThrow(RangeError);
    expect(() => setChannel(l, "kick", [{ at: 760, duration: 9 }])).toThrow(RangeError);
    expect(() => setChannel(l, "", [])).toThrow(RangeError);
  });

  it("preserves channel order when replacing", () => {
    const r = setChannel(makeLoop(), "kick", []);
    expect(Object.keys(r.channels)).toEqual(["kick", "snare"]);
  });
});

describe("removeNotes", () => {
  it("removes all notes at the tick", () => {
    const l: Loop = { ...makeLoop(), channels: { kick: [{ at: 0 }, { at: 0 }, { at: 8 }] } };
    expect(removeNotes(l, "kick", 0).channels.kick).toEqual([{ at: 8 }]);
  });
});

describe("clearChannel", () => {
  it("leaves [] and keeps the key", () => {
    const r = clearChannel(makeLoop(), "kick");
    expect(r.channels.kick).toEqual([]);
    expect(Object.keys(r.channels)).toEqual(["kick", "snare"]);
  });
});

describe("setTempo", () => {
  it("sets the tempo", () => {
    expect(setTempo(makeLoop(), 140).tempo).toBe(140);
  });

  it("throws RangeError outside the bounds or for non-numbers", () => {
    const l = makeLoop();
    expect(() => setTempo(l, 0)).toThrow(RangeError);
    expect(() => setTempo(l, 401)).toThrow(RangeError);
    expect(() => setTempo(l, Number.NaN)).toThrow(RangeError);
    expect(() => setTempo(l, 20)).not.toThrow();
    expect(() => setTempo(l, 400)).not.toThrow();
  });
});

describe("resize", () => {
  it("drops notes that no longer fit when shrinking bars, reporting their channel", () => {
    const l: Loop = {
      ...makeLoop(),
      channels: {
        kick: [{ at: 0 }, { at: 360, duration: 24 }, { at: 360, duration: 25 }, { at: 400 }],
        snare: [{ at: 96 }],
      },
    };
    const { loop, dropped } = resize(l, { bars: 1 });
    expect(loop.bars).toBe(1);
    expect(loop.channels.kick).toEqual([{ at: 0 }, { at: 360, duration: 24 }]);
    expect(loop.channels.snare).toBe(l.channels.snare);
    expect(dropped).toEqual([
      { channel: "kick", note: { at: 360, duration: 25 } },
      { channel: "kick", note: { at: 400 } },
    ]);
  });

  it("drops nothing when growing", () => {
    const r = resize(makeLoop(), { bars: 4, beatsPerBar: 5 });
    expect(r.dropped).toEqual([]);
    expect(r.loop.channels).toEqual(makeLoop().channels);
  });

  it("drops a note at the new length when beatsPerBar shrinks", () => {
    const l: Loop = { ...makeLoop(), bars: 1, channels: { kick: [{ at: 192 }, { at: 288 }] } };
    const { loop, dropped } = resize(l, { beatsPerBar: 3 });
    expect(loop.channels.kick).toEqual([{ at: 192 }]);
    expect(dropped).toEqual([{ channel: "kick", note: { at: 288 } }]);
  });

  it("recomputes loopLength after changing beatsPerBar", () => {
    const l: Loop = { ...makeLoop(), bars: 1 };
    const { loop } = resize(l, { beatsPerBar: 3 });
    expect(loop.beatsPerBar).toBe(3);
    expect(loopLength(loop)).toBe(288);
  });

  it("throws RangeError for invalid sizes", () => {
    const l = makeLoop();
    expect(() => resize(l, { bars: 0 })).toThrow(RangeError);
    expect(() => resize(l, { bars: 1.5 })).toThrow(RangeError);
    expect(() => resize(l, { beatsPerBar: 0 })).toThrow(RangeError);
    expect(() => resize(l, { beatsPerBar: -1 })).toThrow(RangeError);
    expect(() => resize(l, { bars: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
  });
});

describe("steps", () => {
  it("places x at step positions", () => {
    expect(steps("x...x...", { stepTicks: 24 })).toEqual([{ at: 0 }, { at: 96 }]);
  });

  it("treats - and . as rests", () => {
    expect(steps("x-.x", { stepTicks: 24 })).toEqual([{ at: 0 }, { at: 72 }]);
  });

  it("ignores whitespace and | for position", () => {
    expect(steps("x... | x...", { stepTicks: 24 })).toEqual([{ at: 0 }, { at: 96 }]);
  });

  it("copies data onto every note without sharing it", () => {
    const data = { gain: 0.5, tags: ["a"] };
    const notes = steps("xx", { stepTicks: 12, data });
    expect(notes).toEqual([
      { at: 0, data },
      { at: 12, data },
    ]);
    expect(notes[0]!.data).not.toBe(data);
    expect(notes[0]!.data).not.toBe(notes[1]!.data);
  });

  it("throws RangeError for an invalid character", () => {
    expect(() => steps("xa", { stepTicks: 24 })).toThrow(RangeError);
  });

  it("throws RangeError for an invalid stepTicks or data", () => {
    expect(() => steps("x", { stepTicks: 0 })).toThrow(RangeError);
    expect(() => steps("x", { stepTicks: 1.5 })).toThrow(RangeError);
    expect(() => steps("x", { stepTicks: 24, data: Number.NaN })).toThrow(RangeError);
  });

  it("returns [] for an empty pattern", () => {
    expect(steps("", { stepTicks: 24 })).toEqual([]);
  });
});

describe("properties", () => {
  const arbEdit = (loop: Loop): fc.Arbitrary<Loop> => {
    const length = loopLength(loop);
    const channel = fc.constantFrom(...Object.keys(loop.channels), "extra");
    const at = fc.integer({ min: 0, max: length - 1 });
    return fc.oneof(
      fc.tuple(channel, at).map(([c, a]) => toggleNote(loop, c, a)),
      fc.tuple(channel, at).map(([c, a]) => toggleNote(loop, c, a, { duration: length - a, data: { x: [a] } })),
      fc.tuple(channel, at).map(([c, a]) => addNote(loop, c, { at: a, duration: 1 })),
      fc.tuple(channel, at).map(([c, a]) => removeNotes(loop, c, a)),
      fc.tuple(channel, fc.array(at, { maxLength: 5 })).map(([c, ats]) => setChannel(loop, c, ats.map((a) => ({ at: a })))),
      channel.map((c) => clearChannel(loop, c)),
      fc.double({ min: 20, max: 400, noNaN: true }).map((t) => setTempo(loop, t)),
      fc
        .record({ bars: fc.integer({ min: 1, max: 5 }), beatsPerBar: fc.integer({ min: 1, max: 8 }) })
        .map((size) => resize(loop, size).loop),
    );
  };

  it("edit results still pass parseLoop", () => {
    fc.assert(
      fc.property(
        arbLoop.chain((loop) => arbEdit(loop)),
        (edited) => {
          const parsed = parseLoop(edited);
          expect(parsed.ok).toBe(true);
        },
      ),
    );
  });

  it("resize keeps exactly the notes that fit and accounts for every note", () => {
    fc.assert(
      fc.property(
        arbLoop,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 8 }),
        (loop, bars, beatsPerBar) => {
          const { loop: next, dropped } = resize(deepFreeze(structuredClone(loop)), { bars, beatsPerBar });
          const count = (l: Loop) => Object.values(l.channels).reduce((n, notes) => n + notes.length, 0);
          expect(count(next) + dropped.length).toBe(count(loop));
          expect(next.bars).toBe(bars);
          expect(next.beatsPerBar).toBe(beatsPerBar);
        },
      ),
    );
  });
});
