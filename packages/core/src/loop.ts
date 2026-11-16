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
const NOTE_KEYS = new Set(["at", "duration", "data"]);

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function channelPath(id: string): string {
  return id !== "" && !/[.[\]]/.test(id) ? `channels.${id}` : `channels[${JSON.stringify(id)}]`;
}

/** Returns why `value` is not JSON, or `undefined` when it is. `ancestors` detects cycles. */
function jsonProblem(value: unknown, ancestors: Set<object> = new Set()): string | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? undefined : `${value} is not valid JSON`;
  if (typeof value !== "object") return `${typeof value} is not valid JSON`;
  if (ancestors.has(value)) return "cyclic structure is not valid JSON";
  if (!Array.isArray(value) && !isPlainObject(value)) return "only plain objects and arrays are valid JSON";
  ancestors.add(value);
  try {
    const children = Array.isArray(value) ? Array.from(value) : Object.values(value);
    for (const child of children) {
      const problem = jsonProblem(child, ancestors);
      if (problem) return problem;
    }
  } finally {
    ancestors.delete(value);
  }
  return undefined;
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

function validateNote(
  note: unknown,
  path: string,
  length: number | undefined,
  fail: (path: string, message: string) => void,
): void {
  if (!isPlainObject(note)) {
    fail(path, "note must be an object");
    return;
  }
  for (const key of Object.keys(note)) {
    if (!NOTE_KEYS.has(key)) fail(`${path}.${key}`, `unknown key "${key}"`);
  }

  const { at, duration } = note;
  const atOk = typeof at === "number" && Number.isInteger(at) && at >= 0 && (length === undefined || at < length);
  if (!atOk) {
    fail(`${path}.at`, length === undefined ? "at must be an integer >= 0" : `at must be an integer in 0..${length - 1}`);
  }
  if ("duration" in note) {
    if (!isPositiveInteger(duration)) {
      fail(`${path}.duration`, "duration must be an integer >= 1");
    } else if (atOk && length !== undefined && (at as number) + duration > length) {
      fail(`${path}.duration`, `at + duration must not exceed the loop length (${length})`);
    }
  }
  if ("data" in note) {
    const problem = jsonProblem(note.data);
    if (problem) fail(`${path}.data`, problem);
  }
}

function cloneJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (typeof value === "object" && value !== null) {
    // fromEntries defines own properties, so a "__proto__" key stays data.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneJson(v)]));
  }
  // `+ 0` turns -0 into 0, which is what a JSON round trip would produce.
  return typeof value === "number" ? value + 0 : value;
}

function cloneNote(note: Note): Note {
  const out: Note = { at: note.at + 0 };
  if (note.duration !== undefined) out.duration = note.duration + 0;
  if (note.data !== undefined) out.data = cloneJson(note.data);
  return out;
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
