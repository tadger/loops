import type { Clock, Timer } from "@loops/core";

export function createAudioClock(ctx: { readonly currentTime: number }): Clock {
  return { now: () => ctx.currentTime };
}

// Background tabs throttle main-thread timers; Worker timers are exempt.
// Tests stub Worker; real-browser behavior is covered by the demo's manual acceptance.
const WORKER_SOURCE = "onmessage=e=>setInterval(()=>postMessage(0),e.data)";

function startWorker(ms: number, fn: () => void, onFailure: () => void): (() => void) | null {
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
  worker.onmessage = () => fn();
  // A script that fails to load is reported here, after construction succeeded.
  let failed = false;
  worker.onerror = () => {
    if (failed) return;
    failed = true;
    worker.terminate();
    onFailure();
  };
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
      let stop: (() => void) | null = null;
      let cancelled = false;
      const fallBack = () => {
        if (!cancelled) stop = startInterval(ms, fn);
      };
      stop = startWorker(ms, fn, fallBack) ?? startInterval(ms, fn);
      return () => {
        cancelled = true;
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
