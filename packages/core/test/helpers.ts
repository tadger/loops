import fc from "fast-check";
import { PPQN } from "../src/position";
import type { Json, Loop, Note } from "../src/loop";

export function deepFreeze<T>(x: T): T {
  if (typeof x === "object" && x !== null && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const value of Object.values(x)) deepFreeze(value);
  }
  return x;
}

/** `depth` containers around a leaf, built iteratively so building never overflows the stack. */
export function nest(depth: number, kind: "array" | "object"): Json {
  let value: Json = "leaf";
  for (let i = 0; i < depth; i++) value = kind === "array" ? [value] : { k: value };
  return value;
}

const channelId = fc.oneof(
  fc.constantFrom("kick", "snare", "hat", "__proto__", "constructor"),
  fc.string({ minLength: 1, maxLength: 6 }),
);

const jsonData = fc.jsonValue() as fc.Arbitrary<Json>;

function arbNotes(length: number): fc.Arbitrary<Note[]> {
  const note = fc
    .integer({ min: 0, max: length - 1 })
    .chain((at) =>
      fc.record(
        {
          duration: fc.integer({ min: 1, max: length - at }),
          data: jsonData,
        },
        { requiredKeys: [] },
      ).map((rest): Note => ({ at, ...rest })),
    );
  return fc.array(note, { maxLength: 8 });
}

/** Valid loops: 1-4 bars, 1-7 beatsPerBar, 1-4 channels, notes in range, with and without `duration` and `data`. */
export const arbLoop: fc.Arbitrary<Loop> = fc
  .record({
    bars: fc.integer({ min: 1, max: 4 }),
    beatsPerBar: fc.integer({ min: 1, max: 7 }),
    tempo: fc.oneof(fc.integer({ min: 20, max: 400 }), fc.double({ min: 20, max: 400, noNaN: true })),
  })
  .chain(({ bars, beatsPerBar, tempo }) => {
    const length = bars * beatsPerBar * PPQN;
    return fc
      .uniqueArray(channelId, { minLength: 1, maxLength: 4 })
      .chain((ids) => fc.tuple(...ids.map(() => arbNotes(length))).map((lists) => ids.map((id, i) => [id, lists[i]!] as const)))
      .map(
        (entries): Loop => ({
          version: 1,
          bars,
          beatsPerBar,
          tempo,
          channels: Object.fromEntries(entries),
        }),
      );
  });
