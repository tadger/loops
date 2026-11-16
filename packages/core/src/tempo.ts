import { PPQN } from "./position";

/** An immutable (tick, time, bpm) reference point: tempo `bpm` applies from `tick` onward. */
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

/** Creates a frozen anchor placing `tick` at `time` (seconds) with tempo `bpm`. */
export function createAnchor(tick: number, time: number, bpm: number): TempoAnchor {
  assertBpm(bpm);
  return Object.freeze({ tick, time, bpm });
}

/** Duration in seconds of `ticks` at `bpm`. */
export function ticksToSeconds(ticks: number, bpm: number): number {
  assertBpm(bpm);
  return (ticks * 60) / (bpm * PPQN);
}

/** Time in seconds at which `tick` occurs under `anchor`. */
export function timeAt(anchor: TempoAnchor, tick: number): number {
  return anchor.time + ticksToSeconds(tick - anchor.tick, anchor.bpm);
}

/** Fractional tick reached at `time` (seconds) under `anchor`. */
export function tickAt(anchor: TempoAnchor, time: number): number {
  assertBpm(anchor.bpm);
  return anchor.tick + ((time - anchor.time) * anchor.bpm * PPQN) / 60;
}

/** New anchor at `tick` (same instant as under `anchor`) with tempo `bpm`; `anchor` is unchanged. */
export function reanchor(anchor: TempoAnchor, tick: number, bpm: number): TempoAnchor {
  return createAnchor(tick, timeAt(anchor, tick), bpm);
}
