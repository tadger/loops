import type { Clock, Timer } from "@loops/core";

export function createAudioClock(ctx: { readonly currentTime: number }): Clock {
  return { now: () => ctx.currentTime };
}

// Background tabs throttle main-thread timers; Worker timers are exempt.
// The Worker path can't run under Node; the demo's manual acceptance covers it.
const WORKER_SOURCE = "onmessage=e=>setInterval(()=>postMessage(0),e.data)";

function startWorker(ms: number, fn: () => void): (() => void) | null {
  if (
    typeof Worker === "undefined" ||
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  let worker: Worker;
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  try {
    worker = new Worker(url);
  } catch {
    // e.g. CSP forbids blob workers
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
  worker.onmessage = fn;
  worker.postMessage(ms);
  return () => worker.terminate();
}

function startInterval(ms: number, fn: () => void): () => void {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

export function createWorkerTimer(): Timer {
  return {
    every(ms, fn) {
      let stop: (() => void) | null = startWorker(ms, fn) ?? startInterval(ms, fn);
      return () => {
        stop?.();
        stop = null;
      };
    },
  };
}

/** Call from a user gesture; browsers refuse to resume an AudioContext otherwise. */
export async function ensureRunning(ctx: {
  readonly state: string;
  resume(): Promise<void>;
}): Promise<void> {
  if (ctx.state === "suspended") await ctx.resume();
}
