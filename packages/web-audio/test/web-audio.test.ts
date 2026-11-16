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
