import { loopLength } from "./loop";
import type { Loop, Note } from "./loop";

export interface CompiledLoop {
  readonly loop: Loop;
  /** Loop length in ticks. */
  readonly length: number;
  readonly tempo: number;
  /** In `Object.keys` order of `loop.channels`; each channel's notes sorted by `at` (stable). */
  readonly channels: ReadonlyArray<{ readonly id: string; readonly notes: ReadonlyArray<Note> }>;
}

// Keyed by object identity and weakly held: entries die with their loop, and a new loop object
// (e.g. from `resize`) is always compiled afresh.
const compiled = new WeakMap<Loop, CompiledLoop>();

/** Compiles `loop` for scheduling. Memoized per loop object; never mutates `loop`. */
export function compileLoop(loop: Loop): CompiledLoop {
  let result = compiled.get(loop);
  if (result === undefined) {
    result = {
      loop,
      length: loopLength(loop),
      tempo: loop.tempo,
      channels: Object.entries(loop.channels).map(([id, notes]) => ({
        id,
        notes: [...notes].sort((a, b) => a.at - b.at),
      })),
    };
    compiled.set(loop, result);
  }
  return result;
}
