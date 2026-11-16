import type { CompiledLoop } from "./compile";
import type { Note } from "./loop";

export interface ScheduledNote {
  channel: string;
  note: Note;
  /** Absolute tick of this occurrence. */
  absTick: number;
  /** Tick within the loop (the note's `at`). */
  tick: number;
}

/** Index of the first note with `at >= target` (notes sorted by `at`). */
function lowerBound(notes: ReadonlyArray<Note>, target: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid]!.at < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Every note occurrence with `from <= absTick < to`, where occurrences of a note repeat at
 * `originTick + k * length + note.at` for every integer `k`. Ordered by `absTick`, then channel
 * order, then note order. Consecutive windows partition the timeline exactly.
 */
export function queryWindow(
  compiled: CompiledLoop,
  originTick: number,
  from: number,
  to: number,
): ScheduledNote[] {
  if (!(from <= to)) throw new RangeError(`queryWindow: from (${from}) must not exceed to (${to})`);
  if (from === to) return [];

  const { length } = compiled;
  // Every note has 0 <= at < length, so pass k only reaches [base + 0, base + length).
  const firstPass = Math.floor((from - originTick) / length);
  const lastPass = Math.floor((to - 1 - originTick) / length);

  const found: { event: ScheduledNote; channelIndex: number; noteIndex: number }[] = [];
  compiled.channels.forEach(({ id, notes }, channelIndex) => {
    if (notes.length === 0) return;
    for (let pass = firstPass; pass <= lastPass; pass++) {
      const base = originTick + pass * length;
      const end = lowerBound(notes, to - base);
      for (let noteIndex = lowerBound(notes, from - base); noteIndex < end; noteIndex++) {
        const note = notes[noteIndex]!;
        found.push({ event: { channel: id, note, absTick: base + note.at, tick: note.at }, channelIndex, noteIndex });
      }
    }
  });

  found.sort(
    (x, y) => x.event.absTick - y.event.absTick || x.channelIndex - y.channelIndex || x.noteIndex - y.noteIndex,
  );
  return found.map((f) => f.event);
}
