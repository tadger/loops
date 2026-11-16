import { cloneNote, isPlainObject, isPositiveInteger, validateNote } from "./note";
import { PPQN } from "./position";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Note<D extends Json = Json> {
  /** Integer ticks from loop start, `0 <= at < length`. */
  at: number;
  /** Integer ticks, `> 0`; omitted = one-shot. `at + duration <= length`. */
  duration?: number;
  /** Opaque to the library; passed to the handler untouched. */
  data?: D;
}

export interface Loop<D extends Json = Json> {
  version: 1;
  /** Integer >= 1. */
  bars: number;
  /** Integer >= 1. */
  beatsPerBar: number;
  /** Beats per minute, within `MIN_TEMPO..MAX_TEMPO`. */
  tempo: number;
  channels: Record<string, Note<D>[]>;
}

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

export interface Diagnostic {
  /** Location of the problem, e.g. `channels.kick[3].at`; `""` for the root. */
  path: string;
  message: string;
}

export type ParseLoopResult = { ok: true; loop: Loop } | { ok: false; errors: Diagnostic[] };

/** Loop length in ticks. */
export function loopLength(loop: Pick<Loop, "bars" | "beatsPerBar">): number {
  return loop.bars * loop.beatsPerBar * PPQN;
}

const LOOP_KEYS = new Set(["version", "bars", "beatsPerBar", "tempo", "channels"]);

function channelPath(id: string): string {
  return id !== "" && !/[.[\]]/.test(id) ? `channels.${id}` : `channels[${JSON.stringify(id)}]`;
}

/**
 * Validates `input` as a loop, collecting every problem. On success returns a fresh,
 * canonical copy that shares nothing with `input`.
 */
export function parseLoop(input: unknown): ParseLoopResult {
  const errors: Diagnostic[] = [];
  const fail = (path: string, message: string) => void errors.push({ path, message });

  if (!isPlainObject(input)) {
    fail("", "loop must be an object");
    return { ok: false, errors };
  }

  for (const key of Object.keys(input)) {
    if (!LOOP_KEYS.has(key)) fail(key, `unknown key "${key}"`);
  }

  if (input.version !== 1) fail("version", `unsupported version ${String(input.version)}: expected 1`);
  if (!isPositiveInteger(input.bars)) fail("bars", "bars must be an integer >= 1");
  if (!isPositiveInteger(input.beatsPerBar)) fail("beatsPerBar", "beatsPerBar must be an integer >= 1");
  const tempo = input.tempo;
  if (typeof tempo !== "number" || !Number.isFinite(tempo) || tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
    fail("tempo", `tempo must be a number between ${MIN_TEMPO} and ${MAX_TEMPO}`);
  }

  let length: number | undefined;
  if (isPositiveInteger(input.bars) && isPositiveInteger(input.beatsPerBar)) {
    length = loopLength({ bars: input.bars, beatsPerBar: input.beatsPerBar });
    if (!Number.isSafeInteger(length)) {
      fail("bars", "loop length is out of range");
      length = undefined;
    }
  }

  if (!isPlainObject(input.channels)) {
    fail("channels", "channels must be an object");
  } else {
    for (const [id, notes] of Object.entries(input.channels)) {
      const path = channelPath(id);
      if (id === "") fail(path, "channel id must not be empty");
      if (!Array.isArray(notes)) {
        fail(path, "channel must be an array of notes");
        continue;
      }
      for (let i = 0; i < notes.length; i++) validateNote(notes[i], `${path}[${i}]`, length, fail);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, loop: serializeLoop(input as unknown as Loop) };
}

/**
 * Returns a fresh canonical copy of `loop`: fixed key order, notes stably sorted by `at`,
 * channel ids in insertion order. Does not validate; use {@link parseLoop} for untrusted input.
 */
export function serializeLoop(loop: Loop): Loop {
  return {
    version: 1,
    bars: loop.bars,
    beatsPerBar: loop.beatsPerBar,
    tempo: loop.tempo,
    channels: Object.fromEntries(
      Object.entries(loop.channels).map(([id, notes]) => [id, notes.map(cloneNote).sort((a, b) => a.at - b.at)]),
    ),
  };
}
