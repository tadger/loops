import { loopLength } from "./loop";
import type { Loop, Note } from "./loop";

export interface CompiledLoop {
  readonly loop: Loop;
  readonly length: number;
  readonly tempo: number;
  /** In `loop.channels` key order; notes stably sorted by `at`. */
  readonly channels: ReadonlyArray<{ readonly id: string; readonly notes: ReadonlyArray<Note> }>;
}

// Keyed by loop identity: an edited loop is a new object and compiles afresh.
const compiled = new WeakMap<Loop, CompiledLoop>();

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
