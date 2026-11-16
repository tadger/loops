import { compileLoop } from "./compile";
import type { CompiledLoop } from "./compile";
import type { Loop, Note } from "./loop";
import { createAnchor, reanchor, tickAt, ticksToSeconds, timeAt } from "./tempo";
import type { TempoAnchor } from "./tempo";
import { queryWindow } from "./window";

/** A monotonic clock in seconds (e.g. `AudioContext.currentTime`). */
export interface Clock {
  now(): number;
}

/** Calls `fn` roughly every `ms` milliseconds until the returned cancel function is called. */
export interface Timer {
  every(ms: number, fn: () => void): () => void;
}

export interface NoteEvent {
  channel: string;
  /** The loop's own note object, by reference. Handlers must not mutate it. */
  note: Readonly<Note>;
  /** Clock seconds at which to start. */
  time: number;
  /** Seconds, from `note.duration` at the tempo in force; absent for one-shots. */
  duration?: number;
  tick: number;
  /** True if `time` was already in the past when the event was emitted. */
  late: boolean;
}

export interface TransportSnapshot {
  status: "stopped" | "playing" | "paused";
  loop: Loop | null;
}

export interface TransportOptions {
  clock: Clock;
  timer: Timer;
  /** Seconds scheduled ahead of the clock. Default 0.1. */
  lookahead?: number;
  /** Seconds between scheduling passes. Default 0.025. */
  interval?: number;
  /** Seconds between `start()` and the first scheduled tick. Default 0.05. */
  startDelay?: number;
  /** Receives errors thrown by channel handlers. Default `console.error`. */
  onError?: (error: unknown, info: { channel: string }) => void;
}

export interface Transport {
  subscribe(listener: () => void): () => void;
  /** Stable reference, replaced only when `status` or `loop` changes. */
  getSnapshot(): TransportSnapshot;
  /** Loop-relative tick on the scheduled timeline at `at` (default `clock.now()`); `null` until a loop is set. */
  getPosition(at?: number): { tick: number } | null;
  setLoop(loop: Loop): void;
  start(): void;
  pause(): void;
  stop(): void;
  dispose(): void;
  channel(id: string, handler: (e: NoteEvent) => void): () => void;
}

const DEFAULT_BPM = 120;
/** Keeps a time computed for an exact tick from flooring to the tick before it. */
const TICK_EPSILON = 1e-9;
const POSITION_HISTORY_SECONDS = 1;

const noop = () => {};

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Timeline in force until absolute tick `until`, when a `setLoop` superseded it. */
interface Segment {
  readonly anchor: TempoAnchor;
  readonly originTick: number;
  readonly length: number;
  readonly until: number;
}

function tickAtTime(anchor: TempoAnchor, time: number): number {
  return Math.floor(tickAt(anchor, time) + TICK_EPSILON);
}

/** Origin that keeps the relative tick at `at`, modulo the new length. */
function resizedOrigin(originTick: number, at: number, oldLength: number, newLength: number): number {
  return at - mod(mod(at - originTick, oldLength), newLength);
}

export function createTransport(options: TransportOptions): Transport {
  const { clock, timer, lookahead = 0.1, interval = 0.025, startDelay = 0.05 } = options;
  const onError = options.onError ?? ((error: unknown) => console.error(error));

  let disposed = false;
  let snapshot: TransportSnapshot = { status: "stopped", loop: null };
  let compiled: CompiledLoop | null = null;
  // Absolute-tick timeline: loop-relative tick = (absolute - originTick) mod length.
  let anchor: TempoAnchor = createAnchor(0, 0, DEFAULT_BPM);
  let originTick = 0;
  /** Absolute tick up to which notes have been emitted; the committed region ends here. */
  let scheduledUpTo = 0;
  /** Positions before this absolute tick clamp to it. */
  let positionFloor = 0;
  let history: Segment[] = [];
  /** Bumped on stop and dispose so an in-progress pass stops emitting into a reset timeline. */
  let session = 0;
  let cancelTimer: (() => void) | null = null;

  const listeners = new Set<() => void>();
  const handlers = new Map<string, Set<{ handler: (e: NoteEvent) => void }>>();

  function replaceSnapshot(next: Partial<TransportSnapshot>): boolean {
    const status = next.status ?? snapshot.status;
    const loop = next.loop !== undefined ? next.loop : snapshot.loop;
    if (status === snapshot.status && loop === snapshot.loop) return false;
    snapshot = { status, loop };
    return true;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function update(next: Partial<TransportSnapshot>): void {
    if (replaceSnapshot(next)) notify();
  }

  const bpm = () => compiled?.tempo ?? DEFAULT_BPM;

  function relative(absTick: number): number {
    return mod(absTick - originTick, compiled!.length);
  }

  function deliver(channel: string, event: NoteEvent): void {
    const registered = handlers.get(channel);
    if (registered === undefined) return;
    for (const entry of [...registered]) {
      try {
        entry.handler(event);
      } catch (error) {
        onError(error, { channel });
      }
    }
  }

  function pump(): void {
    if (disposed || snapshot.status !== "playing") return;
    const now = clock.now();
    const horizon = Math.floor(tickAt(anchor, now + lookahead));
    if (!(horizon > scheduledUpTo)) return;
    const from = scheduledUpTo;
    // Commit before emitting so a re-entrant pump never re-queries this window.
    scheduledUpTo = horizon;
    if (compiled === null) return;

    const pass = session;
    const passAnchor = anchor;
    for (const hit of queryWindow(compiled, originTick, from, horizon)) {
      if (pass !== session) return;
      const time = timeAt(passAnchor, hit.absTick);
      const event: NoteEvent = { channel: hit.channel, note: hit.note, time, tick: hit.tick, late: time < now };
      if (hit.note.duration !== undefined) event.duration = ticksToSeconds(hit.note.duration, passAnchor.bpm);
      deliver(hit.channel, event);
    }
  }

  function startTimer(): void {
    stopTimer();
    cancelTimer = timer.every(interval * 1000, pump);
  }

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  /** Keeps the old timeline for positions before `at` so they don't jump when `setLoop` changes it. */
  function supersedeSegment(at: number): void {
    if (compiled === null) {
      positionFloor = at;
      return;
    }
    const currentStart = history.at(-1)?.until ?? positionFloor;
    if (currentStart < at) history.push({ anchor, originTick, length: compiled.length, until: at });
    const cutoff = clock.now() - POSITION_HISTORY_SECONDS;
    while (history.length > 0 && timeAt(history[0]!.anchor, history[0]!.until) < cutoff) {
      positionFloor = history.shift()!.until;
    }
  }

  function positionAt(time: number): number {
    for (const segment of history) {
      const abs = tickAtTime(segment.anchor, time);
      if (abs < segment.until) return mod(Math.max(positionFloor, abs) - segment.originTick, segment.length);
    }
    return relative(Math.max(positionFloor, tickAtTime(anchor, time)));
  }

  function playFrom(tick: number): void {
    anchor = createAnchor(tick, clock.now() + startDelay, bpm());
    positionFloor = tick;
    history = [];
    // Timer first: subscribers may call pause/stop/dispose.
    replaceSnapshot({ status: "playing" });
    startTimer();
    notify();
    pump();
  }

  return {
    subscribe(listener) {
      if (disposed) return noop;
      const wrapped = () => listener();
      listeners.add(wrapped);
      return () => void listeners.delete(wrapped);
    },

    getSnapshot: () => snapshot,

    getPosition(at) {
      if (compiled === null) return null;
      if (snapshot.status !== "playing") return { tick: relative(scheduledUpTo) };
      return { tick: positionAt(at ?? clock.now()) };
    },

    setLoop(loop) {
      if (disposed || loop === snapshot.loop) return;
      // Applies from the first uncommitted tick; earlier notes are already emitted.
      const at = scheduledUpTo;
      const next = compileLoop(loop);
      if (snapshot.status === "playing") supersedeSegment(at);
      if (next.tempo !== anchor.bpm) anchor = reanchor(anchor, at, next.tempo);
      // The first loop starts at its own tick 0.
      if (compiled === null) originTick = at;
      else if (next.length !== compiled.length) originTick = resizedOrigin(originTick, at, compiled.length, next.length);
      compiled = next;
      update({ loop });
    },

    start() {
      if (disposed || snapshot.status === "playing") return;
      if (snapshot.status === "stopped") {
        originTick = 0;
        scheduledUpTo = 0;
      }
      playFrom(scheduledUpTo);
    },

    pause() {
      if (disposed || snapshot.status !== "playing") return;
      stopTimer();
      update({ status: "paused" });
    },

    stop() {
      if (disposed) return;
      stopTimer();
      session++;
      originTick = 0;
      scheduledUpTo = 0;
      positionFloor = 0;
      history = [];
      update({ status: "stopped" });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      session++;
      stopTimer();
      listeners.clear();
      handlers.clear();
    },

    channel(id, handler) {
      if (disposed) return noop;
      const entry = { handler };
      let registered = handlers.get(id);
      if (registered === undefined) {
        registered = new Set();
        handlers.set(id, registered);
      }
      registered.add(entry);
      return () => {
        const current = handlers.get(id);
        if (current?.delete(entry) && current.size === 0) handlers.delete(id);
      };
    },
  };
}
