import type { CompiledLoop } from "./compile";
import type { Note } from "./loop";

export interface ScheduledNote {
  channel: string;
  note: Note;
  /** Absolute tick of this occurrence. */
  absTick: number;
  tick: number;
}

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
 * Occurrences in `[from, to)`; a note repeats at `originTick + k * length + note.at` for every integer `k`.
 * Ordered by `absTick`, then channel, then note order.
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
  // 0 <= at < length, so pass k only reaches [base, base + length).
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
