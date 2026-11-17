import { pos } from "@loops/core";
import type { Loop, Note } from "@loops/core";

interface Hit {
  at: string;
  d?: number;
  g?: number;
  r?: number;
}

const METER = { beatsPerBar: 4 };

function notes(hits: Hit[]): Note[] {
  return hits.map(({ at, d, g, r }) => {
    const data: Record<string, number> = {};
    if (g !== undefined) data.gain = g;
    if (r !== undefined) data.rate = r;
    return {
      at: pos(at, METER),
      ...(d !== undefined && { duration: d }),
      ...(Object.keys(data).length > 0 && { data }),
    };
  });
}

const hihatBar = (bar: number): Hit[] => [
  { at: `${bar}.1.01`, g: 0.7 },
  { at: `${bar}.2.01`, g: 0.8 },
  { at: `${bar}.3.01`, g: 0.7 },
  { at: `${bar}.4.01`, g: 0.8 },
  { at: `${bar}.4.53`, g: 0.6 },
];

/** After Adam Renklint's dilla boom-bap demo, in tick positions; see public/samples/CREDITS.md. */
export function createBoomBapLoop(): Loop {
  return {
    version: 1,
    bars: 2,
    beatsPerBar: 4,
    tempo: 88,
    channels: {
      kick: notes([
        { at: "1.1.01" },
        { at: "1.1.51", g: 0.8 },
        { at: "1.2.88" },
        { at: "1.3.75" },
        { at: "1.4.72", g: 0.8 },
        { at: "2.1.51", g: 0.7 },
        { at: "2.3.51", g: 0.8 },
        { at: "2.3.88" },
      ]),
      snare: notes([{ at: "1.1.91" }, { at: "1.3.91" }, { at: "2.1.91" }, { at: "2.4.03" }]),
      hihat: notes([...hihatBar(1), ...hihatBar(2)]),
      bass: notes([
        { at: "1.1.01", d: 60, g: 0.8, r: 0.55 },
        { at: "1.2.72", d: 15, g: 0.5, r: 0.55 },
        { at: "1.3.02", d: 40, g: 0.8, r: 0.55 },
        { at: "1.4.01", d: 40, g: 0.6, r: 0.64 },
        { at: "1.4.51", d: 100, g: 0.8, r: 0.74 },
        { at: "2.3.51", d: 60, g: 0.8, r: 0.46 },
        { at: "2.4.51", d: 40, g: 0.8, r: 0.52 },
      ]),
      plong1: notes([{ at: "1.1.01", d: 95 }]),
      plong2: notes([
        { at: "1.4.90", d: 60, g: 0.4 },
        { at: "2.1.52", d: 60, g: 0.7 },
      ]),
      string1: notes([
        { at: "1.3.75", d: 90, g: 0.6 },
        { at: "1.4.52", d: 90, g: 0.2 },
        { at: "2.3.25", d: 70, g: 0.6 },
        { at: "2.4.01", d: 85, g: 0.3 },
        // His 85 would run past the loop's end; 22 ends it exactly.
        { at: "2.4.75", d: 22, g: 0.1 },
      ]),
      string2: notes([{ at: "2.2.50", d: 70, g: 0.6 }]),
      string3: notes([
        { at: "1.2.05", d: 45, g: 0.6 },
        { at: "1.2.51", d: 45, g: 0.4 },
        { at: "1.3.05", d: 45, g: 0.2 },
        { at: "1.3.51", d: 45, g: 0.05 },
        { at: "2.2.05", d: 45, g: 0.6 },
      ]),
    },
  };
}
