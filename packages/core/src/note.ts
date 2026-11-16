// Internal note helpers shared by `parseLoop` and the edit helpers. Not part of the public API.
import type { Json, Note } from "./loop";

const NOTE_KEYS = new Set(["at", "duration", "data"]);

export type Fail = (path: string, message: string) => void;

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Returns why `value` is not JSON, or `undefined` when it is. `ancestors` detects cycles. */
export function jsonProblem(value: unknown, ancestors: Set<object> = new Set()): string | undefined {
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

/** Reports every problem with `note` through `fail`. `length` is the loop length, if known. */
export function validateNote(note: unknown, path: string, length: number | undefined, fail: Fail): void {
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

export function cloneJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (typeof value === "object" && value !== null) {
    // fromEntries defines own properties, so a "__proto__" key stays data.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneJson(v)]));
  }
  // `+ 0` turns -0 into 0, which is what a JSON round trip would produce.
  return typeof value === "number" ? value + 0 : value;
}

export function cloneNote(note: Note): Note {
  const out: Note = { at: note.at + 0 };
  if (note.duration !== undefined) out.duration = note.duration + 0;
  if (note.data !== undefined) out.data = cloneJson(note.data);
  return out;
}
