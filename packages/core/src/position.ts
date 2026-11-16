/** Ticks per quarter-note beat. */
export const PPQN = 96;

export interface Meter {
  beatsPerBar: number;
}

export type ParsePosResult = { ok: true; tick: number } | { ok: false; error: string };

const POS_PATTERN = /^(\d+)\.(\d+)\.(\d{2})$/;

/** Parses a 1-based "bar.beat.tick" position (tick 01..96) into an absolute tick. */
export function parsePos(text: string, meter: Meter): ParsePosResult {
  const match = POS_PATTERN.exec(text);
  if (!match) return { ok: false, error: `invalid position "${text}": expected bar.beat.tick, e.g. "1.1.01"` };
  const bar = Number(match[1]);
  const beat = Number(match[2]);
  const tickInBeat = Number(match[3]);
  if (bar < 1) return { ok: false, error: `invalid position "${text}": bar must be >= 1` };
  if (beat < 1 || beat > meter.beatsPerBar) {
    return { ok: false, error: `invalid position "${text}": beat must be 1..${meter.beatsPerBar}` };
  }
  if (tickInBeat < 1 || tickInBeat > PPQN) {
    return { ok: false, error: `invalid position "${text}": tick must be 01..${PPQN}` };
  }
  const tick = ((bar - 1) * meter.beatsPerBar + (beat - 1)) * PPQN + (tickInBeat - 1);
  if (!Number.isSafeInteger(tick)) return { ok: false, error: `invalid position "${text}": out of range` };
  return { ok: true, tick };
}

/** Like {@link parsePos}, but throws `RangeError` when invalid. */
export function pos(text: string, meter: Meter): number {
  const result = parsePos(text, meter);
  if (!result.ok) throw new RangeError(result.error);
  return result.tick;
}

export function formatPos(tick: number, meter: Meter): string {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError(`tick must be a non-negative integer, got ${tick}`);
  }
  const ticksPerBar = meter.beatsPerBar * PPQN;
  const bar = Math.floor(tick / ticksPerBar) + 1;
  const beat = Math.floor((tick % ticksPerBar) / PPQN) + 1;
  const tickInBeat = (tick % PPQN) + 1;
  return `${bar}.${beat}.${String(tickInBeat).padStart(2, "0")}`;
}
