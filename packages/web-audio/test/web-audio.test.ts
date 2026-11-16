import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioClock, createWorkerTimer, ensureRunning } from "../src/index";

describe("createAudioClock", () => {
  it("follows ctx.currentTime", () => {
    const ctx = { currentTime: 0 };
    const clock = createAudioClock(ctx);
    expect(clock.now()).toBe(0);
    ctx.currentTime = 1.5;
    expect(clock.now()).toBe(1.5);
  });
});

describe("createWorkerTimer (setInterval fallback)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Worker", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls fn every interval until cancelled", () => {
    const fn = vi.fn();
    const cancel = createWorkerTimer().every(25, fn);
    vi.advanceTimersByTime(24);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(3);
    cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("cancel is idempotent", () => {
    const cancel = createWorkerTimer().every(25, () => {});
    cancel();
    expect(() => cancel()).not.toThrow();
  });
});

describe("createWorkerTimer (Worker branch)", () => {
  let log: string[];
  let workers: FakeWorker[];
  let constructorThrows: boolean;

  class FakeWorker {
    onmessage: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    posted: unknown[] = [];
    terminate = vi.fn();
    constructor(readonly url: string) {
      log.push("construct");
      if (constructorThrows) throw new Error("blocked by CSP");
      workers.push(this);
    }
    postMessage(message: unknown) {
      this.posted.push(message);
    }
  }

  beforeEach(() => {
    log = [];
    workers = [];
    constructorThrows = false;
    vi.useFakeTimers();
    vi.stubGlobal("Worker", FakeWorker);
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      log.push("create");
      return "blob:fake";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => void log.push("revoke"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("posts the interval to the worker and revokes the URL right after constructing it", () => {
    createWorkerTimer().every(25, () => {});
    expect(log).toEqual(["create", "construct", "revoke"]);
    expect(workers[0]!.url).toBe("blob:fake");
    expect(workers[0]!.posted).toEqual([25]);
  });

  it("calls fn with no arguments on each worker message", () => {
    const fn = vi.fn();
    createWorkerTimer().every(25, fn);
    workers[0]!.onmessage!({ data: 0 });
    workers[0]!.onmessage!({ data: 0 });
    expect(fn.mock.calls).toEqual([[], []]);
  });

  it("does not use setInterval while the worker runs", () => {
    const fn = vi.fn();
    createWorkerTimer().every(25, fn);
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("terminates the worker on cancel, and cancel is idempotent", () => {
    const cancel = createWorkerTimer().every(25, () => {});
    expect(workers[0]!.terminate).not.toHaveBeenCalled();
    cancel();
    cancel();
    expect(workers[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back to setInterval when the constructor throws, and still revokes the URL", () => {
    constructorThrows = true;
    const fn = vi.fn();
    const cancel = createWorkerTimer().every(25, fn);
    expect(log).toEqual(["create", "construct", "revoke"]);
    vi.advanceTimersByTime(75);
    expect(fn).toHaveBeenCalledTimes(3);
    cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("falls back to setInterval exactly once when the worker errors after construction", () => {
    const fn = vi.fn();
    createWorkerTimer().every(25, fn);
    const worker = workers[0]!;
    worker.onerror!({});
    worker.onerror!({});
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn.mock.calls.every((args) => args.length === 0)).toBe(true);
  });

  it("cancel after a fallback stops the interval and does not terminate the worker again", () => {
    const fn = vi.fn();
    const cancel = createWorkerTimer().every(25, fn);
    const worker = workers[0]!;
    worker.onerror!({});
    vi.advanceTimersByTime(50);
    cancel();
    cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not start an interval when the worker errors after cancel", () => {
    const fn = vi.fn();
    const cancel = createWorkerTimer().every(25, fn);
    cancel();
    workers[0]!.onerror!({});
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ensureRunning", () => {
  it("resumes a suspended context and resolves after it", async () => {
    let resumed = false;
    const ctx = {
      state: "suspended",
      resume: vi.fn(async () => {
        await Promise.resolve();
        resumed = true;
      }),
    };
    await ensureRunning(ctx);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(resumed).toBe(true);
  });

  it("does not resume a running context", async () => {
    const ctx = { state: "running", resume: vi.fn(async () => {}) };
    await ensureRunning(ctx);
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("rejects when resume rejects", async () => {
    const ctx = {
      state: "suspended",
      resume: vi.fn(() => Promise.reject(new Error("blocked"))),
    };
    await expect(ensureRunning(ctx)).rejects.toThrow("blocked");
  });
});
