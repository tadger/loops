import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loopLength, MAX_TEMPO, MIN_TEMPO, parseLoop, serializeLoop } from "../src/loop";
import type { Loop } from "../src/loop";
import { arbLoop, deepFreeze } from "./helpers";

const SPEC_EXAMPLE = {
  version: 1,
  bars: 2,
  beatsPerBar: 4,
  tempo: 92,
  channels: {
    kick: [{ at: 0, duration: 24, data: { gain: 1 } }, { at: 192 }],
    snare: [{ at: 96 }, { at: 288 }],
  },
};

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, bars: 1, beatsPerBar: 4, tempo: 120, channels: { kick: [{ at: 0 }] }, ...overrides };
}

function paths(input: unknown): string[] {
  const result = parseLoop(input);
  if (result.ok) throw new Error("expected parse failure");
  return result.errors.map((e) => e.path);
}

function parseOk(input: unknown): Loop {
  const result = parseLoop(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.loop;
}

describe("loopLength and tempo bounds", () => {
  it("computes length in ticks", () => {
    expect(loopLength({ bars: 2, beatsPerBar: 4 })).toBe(768);
    expect(MIN_TEMPO).toBe(20);
    expect(MAX_TEMPO).toBe(400);
  });
});

describe("parseLoop / serializeLoop", () => {
  it("parses the spec example", () => {
    const loop = parseOk(SPEC_EXAMPLE);
    expect(serializeLoop(loop)).toEqual(SPEC_EXAMPLE);
  });

  it("canonical key order and note order", () => {
    const shuffled = {
      channels: { kick: [{ at: 192 }, { data: { gain: 1 }, duration: 24, at: 0 }] },
      tempo: 92,
      beatsPerBar: 4,
      bars: 2,
      version: 1,
    };
    const expected =
      '{"version":1,"bars":2,"beatsPerBar":4,"tempo":92,"channels":{"kick":[{"at":0,"duration":24,"data":{"gain":1}},{"at":192}]}}';
    expect(JSON.stringify(serializeLoop(shuffled as Loop))).toBe(expected);
    expect(JSON.stringify(parseOk(shuffled))).toBe(expected);
  });

  it("keeps input order for notes with equal at and for channel ids", () => {
    const loop = parseOk(
      base({ channels: { zed: [{ at: 5, data: 1 }, { at: 5, data: 2 }, { at: 1, data: 3 }], abc: [] } }),
    );
    expect(Object.keys(loop.channels)).toEqual(["zed", "abc"]);
    expect(loop.channels.zed!.map((n) => n.data)).toEqual([3, 1, 2]);
  });

  it("round-trips", () => {
    fc.assert(
      fc.property(arbLoop, (l) => {
        const canonical = serializeLoop(l);
        const result = parseLoop(JSON.parse(JSON.stringify(canonical)));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.loop).toEqual(canonical);
      }),
    );
  });

  it("collects all errors, not just the first", () => {
    const found = paths({ version: 2, bars: 1, beatsPerBar: 4, tempo: 0, channels: { kick: [{ at: 384 }] } });
    expect(found).toEqual(expect.arrayContaining(["version", "tempo", "channels.kick[0].at"]));
  });

  const rejections: [string, unknown, string][] = [
    ["null root", null, ""],
    ["array root", [], ""],
    ["string root", "loop", ""],
    ["bars 0", base({ bars: 0 }), "bars"],
    ["bars 1.5", base({ bars: 1.5 }), "bars"],
    ["beatsPerBar 0", base({ beatsPerBar: 0 }), "beatsPerBar"],
    ["tempo 0", base({ tempo: 0 }), "tempo"],
    ["tempo NaN", base({ tempo: NaN }), "tempo"],
    ["tempo 19", base({ tempo: 19 }), "tempo"],
    ["tempo 401", base({ tempo: 401 }), "tempo"],
    ["missing channels", { version: 1, bars: 1, beatsPerBar: 4, tempo: 120 }, "channels"],
    ["channel not an array", base({ channels: { kick: {} } }), "channels.kick"],
    ["empty channel id", base({ channels: { "": [] } }), 'channels[""]'],
    ["at -1", base({ channels: { kick: [{ at: -1 }] } }), "channels.kick[0].at"],
    ["at 0.5", base({ channels: { kick: [{ at: 0.5 }] } }), "channels.kick[0].at"],
    ["at == length", base({ channels: { kick: [{ at: 384 }] } }), "channels.kick[0].at"],
    ["duration 0", base({ channels: { kick: [{ at: 0, duration: 0 }] } }), "channels.kick[0].duration"],
    ["at + duration > length", base({ channels: { kick: [{ at: 380, duration: 5 }] } }), "channels.kick[0].duration"],
    ["unknown key on loop", base({ extra: 1 }), "extra"],
    ["unknown key on note", base({ channels: { kick: [{ at: 0, extra: 1 }] } }), "channels.kick[0].extra"],
    ["note not an object", base({ channels: { kick: [7] } }), "channels.kick[0]"],
  ];
  it.each(rejections)("rejects %s", (_name, input, path) => {
    expect(paths(input)).toContain(path);
  });

  it("accepts a note ending exactly at the loop end", () => {
    expect(parseLoop(base({ channels: { kick: [{ at: 380, duration: 4 }] } })).ok).toBe(true);
  });

  describe("data validation", () => {
    class Thing {}
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const bad: [string, unknown][] = [
      ["undefined", undefined],
      ["NaN", NaN],
      ["Infinity", Infinity],
      ["a function", () => 1],
      ["a Date", new Date()],
      ["a class instance", new Thing()],
      ["a cyclic object", cyclic],
      ["nested undefined", { a: [1, { b: undefined }] }],
      ["a Map", new Map()],
    ];
    it.each(bad)("rejects %s", (_name, data) => {
      const found = paths(base({ channels: { kick: [{ at: 0, data }] } }));
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((p) => p.endsWith(".data"))).toBe(true);
    });

    it("accepts deeply nested JSON", () => {
      let deep: unknown = "leaf";
      for (let i = 0; i < 500; i++) deep = i % 2 ? [deep] : { k: deep };
      const loop = parseOk(base({ channels: { kick: [{ at: 0, data: deep }] } }));
      expect(loop.channels.kick![0]!.data).toEqual(deep);
    });

    it("accepts a shared (non-cyclic) reference", () => {
      const shared = { a: 1 };
      expect(parseLoop(base({ channels: { kick: [{ at: 0, data: [shared, shared] }] } })).ok).toBe(true);
    });
  });

  it.each(["__proto__", "constructor"])("handles %s channel ids safely", (id) => {
    const text = `{"version":1,"bars":1,"beatsPerBar":4,"tempo":120,"channels":{${JSON.stringify(id)}:[{"at":0}]}}`;
    const loop = parseOk(JSON.parse(text));
    expect(Object.keys(loop.channels)).toEqual([id]);
    expect(Object.getPrototypeOf(loop.channels)).toBe(Object.prototype);
    expect(({} as any).at).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(loop.channels, id)?.value).toEqual([{ at: 0 }]);
    const again = serializeLoop(loop);
    expect(Object.keys(again.channels)).toEqual([id]);
    expect(Object.getPrototypeOf(again.channels)).toBe(Object.prototype);
  });

  it("handles __proto__ keys inside data safely", () => {
    const data = JSON.parse('{"__proto__":{"polluted":true}}');
    const loop = parseOk(base({ channels: { kick: [{ at: 0, data }] } }));
    const out = loop.channels.kick![0]!.data as object;
    expect(Object.keys(out)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("output does not alias input", () => {
    const input = structuredClone(SPEC_EXAMPLE) as any;
    const loop = parseOk(input);
    const before = structuredClone(loop);
    input.channels.kick[0].data.gain = 99;
    input.channels.kick.push({ at: 1 });
    input.channels.hat = [];
    input.tempo = 50;
    expect(loop).toEqual(before);

    const out = serializeLoop(loop);
    expect(out).not.toBe(loop);
    expect(out.channels.kick![0]!.data).not.toBe(loop.channels.kick![0]!.data);
    expect(out.channels.kick).not.toBe(loop.channels.kick);
  });

  it("does not mutate a frozen input", () => {
    const frozen = deepFreeze(structuredClone(SPEC_EXAMPLE)) as unknown as Loop;
    expect(() => serializeLoop(frozen)).not.toThrow();
    expect(parseLoop(frozen).ok).toBe(true);
  });

  it("normalizes -0 so JSON round-trips hold", () => {
    const loop = parseOk(base({ channels: { kick: [{ at: -0, data: -0 }] } }));
    expect(Object.is(loop.channels.kick![0]!.at, 0)).toBe(true);
    expect(Object.is(loop.channels.kick![0]!.data, 0)).toBe(true);
  });
});
