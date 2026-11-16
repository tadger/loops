import { PPQN } from "./position";

/** Tempo `bpm` applies from `tick`, which occurs at `time` (seconds). */
export interface TempoAnchor {
  readonly tick: number;
  readonly time: number;
  readonly bpm: number;
}

function assertBpm(bpm: number): void {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError(`invalid bpm ${bpm}: must be a finite number > 0`);
  }
}

export function createAnchor(tick: number, time: number, bpm: number): TempoAnchor {
  assertBpm(bpm);
  return Object.freeze({ tick, time, bpm });
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  assertBpm(bpm);
  return (ticks * 60) / (bpm * PPQN);
}

export function timeAt(anchor: TempoAnchor, tick: number): number {
  return anchor.time + ticksToSeconds(tick - anchor.tick, anchor.bpm);
}

/** Fractional (unfloored) tick reached at `time`. */
export function tickAt(anchor: TempoAnchor, time: number): number {
  assertBpm(anchor.bpm);
  return anchor.tick + ((time - anchor.time) * anchor.bpm * PPQN) / 60;
}

export function reanchor(anchor: TempoAnchor, tick: number, bpm: number): TempoAnchor {
  return createAnchor(tick, timeAt(anchor, tick), bpm);
}
