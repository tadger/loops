import { describe, expect, it, vi } from "vitest";
import type { Loop } from "../src/loop";
import { createFakeEnv } from "../src/testing";
import type { FakeEnv } from "../src/testing";
import { createTransport } from "../src/transport";
import type { NoteEvent, Transport, TransportOptions } from "../src/transport";

// 1 bar of 4/4 at 120 bpm = 384 ticks.
function makeLoop(): Loop {
  return {
    version: 1,
    bars: 1,
    beatsPerBar: 4,
    tempo: 120,
    channels: { kick: [{ at: 0 }, { at: 192 }], snare: [{ at: 96 }] },
  };
}

/** Clock time of absolute tick `t` at 120 bpm, including the default 50 ms start delay. */
const timeOf = (t: number, startedAt = 0) => startedAt + 0.05 + (t * 60) / (120 * 96);

function setup(options: Partial<TransportOptions> = {}) {
  const env = createFakeEnv();
  const onError = vi.fn();
  const transport = createTransport({ clock: env.clock, timer: env.timer, onError, ...options });
  const events: NoteEvent[] = [];
  const record = (id: string) => transport.channel(id, (e) => void events.push(e));
  return { env, transport, events, record, onError };
}

const summary = (events: NoteEvent[]) => events.map((e) => [e.channel, e.tick, e.late]);

describe("createFakeEnv", () => {
  it("runs the clock in exact steps and fires active timers after each", () => {
    const env = createFakeEnv();
    const seen: number[] = [];
    const cancel = env.timer.every(25, () => seen.push(env.clock.now()));
    expect(env.timer.activeCount).toBe(1);
    expect(env.timer.lastMs).toBe(25);
    env.run(0.1);
    expect(seen).toEqual([1, 2, 3, 4].map((i) => i * 0.025));
    expect(env.clock.now()).toBe(4 * 0.025);
    env.clock.set(1);
    env.run(0.06); // a partial last step lands exactly on start + seconds
    expect(seen.slice(4)).toEqual([1.025, 1.05, 1.06]);
    cancel();
    cancel();
    expect(env.timer.activeCount).toBe(0);
    env.timer.fire();
    expect(seen).toHaveLength(7);
    env.clock.set(5);
    env.clock.advance(0.5);
    expect(env.clock.now()).toBe(5.5);
  });
});

describe("transport", () => {
  it("starts stopped with no loop and no position", () => {
    const { transport } = setup();
    expect(transport.getSnapshot()).toEqual({ status: "stopped", loop: null });
    expect(transport.getPosition()).toBeNull();
  });

  it("setLoop notifies once and updates the snapshot; the same loop again is a no-op", () => {
    const { transport } = setup();
    const L = makeLoop();
    const listener = vi.fn();
    transport.subscribe(listener);
    transport.setLoop(L);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = transport.getSnapshot();
    expect(snapshot.loop).toBe(L);
    expect(transport.getSnapshot()).toBe(snapshot);

    transport.setLoop(L);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toBe(snapshot);
  });

  it("subscribe returns an unsubscribe", () => {
    const { transport } = setup();
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);
    unsubscribe();
    transport.setLoop(makeLoop());
    expect(listener).not.toHaveBeenCalled();
  });

  it("plays the loop with the scheduled times, loop-relative ticks and note identity", () => {
    const { env, transport, events, record } = setup();
    const L = makeLoop();
    record("kick");
    record("snare");
    transport.setLoop(L);
    transport.start();
    expect(transport.getSnapshot().status).toBe("playing");
    env.run(2.1);

    expect(summary(events)).toEqual([
      ["kick", 0, false],
      ["snare", 96, false],
      ["kick", 192, false],
      ["kick", 0, false],
    ]);
    const times = events.map((e) => e.time);
    [0.05, 0.55, 1.05, 2.05].forEach((t, i) => expect(times[i]).toBeCloseTo(t, 9));
    expect(events[0]!.note).toBe(L.channels.kick![0]);
    expect(events[1]!.note).toBe(L.channels.snare![0]);
    expect(events[0]!.duration).toBeUndefined();
    expect(env.timer.lastMs).toBe(25);
    expect(env.timer.activeCount).toBe(1);
  });

  it("converts note duration to seconds at the loop tempo", () => {
    const { env, transport, events, record } = setup();
    record("pad");
    transport.setLoop({ ...makeLoop(), channels: { pad: [{ at: 0, duration: 24 }] } });
    transport.start();
    env.run(0.2);
    expect(events).toHaveLength(1);
    expect(events[0]!.duration).toBeCloseTo(0.125, 12);
  });

  it("isolates a throwing handler, reports it to onError, and keeps playing", () => {
    const { env, transport, onError } = setup();
    const boom = new Error("boom");
    const received: number[] = [];
    transport.channel("kick", () => {
      throw boom;
    });
    transport.channel("kick", (e) => void received.push(e.tick));
    transport.setLoop(makeLoop());
    transport.start();
    env.run(1.2);
    expect(received).toEqual([0, 192]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(boom, { channel: "kick" });
    expect(transport.getSnapshot().status).toBe("playing");
  });

  it("defaults onError to console.error", () => {
    const env = createFakeEnv();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const transport = createTransport({ clock: env.clock, timer: env.timer });
      const boom = new Error("boom");
      transport.channel("kick", () => {
        throw boom;
      });
      transport.setLoop(makeLoop());
      transport.start();
      env.run(0.2);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]).toContain(boom);
    } finally {
      spy.mockRestore();
    }
  });

  it("drops events for channels without handlers and stops delivery after unsubscribe", () => {
    const { env, transport, events, record } = setup();
    const unsubscribe = record("kick");
    transport.setLoop(makeLoop());
    transport.start();
    env.run(0.6);
    expect(summary(events)).toEqual([["kick", 0, false]]);
    unsubscribe();
    env.run(2);
    expect(events).toHaveLength(1);
  });

  it("pause cancels the timer and emits nothing; start resumes without duplicates", () => {
    const { env, transport, events, record } = setup();
    record("kick");
    record("snare");
    transport.setLoop(makeLoop());
    const listener = vi.fn();
    transport.subscribe(listener);

    transport.start();
    env.run(0.3);
    transport.pause();
    expect(transport.getSnapshot().status).toBe("paused");
    expect(env.timer.activeCount).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    const emittedBeforePause = events.length;
    env.run(1);
    expect(events).toHaveLength(emittedBeforePause);

    transport.start();
    expect(transport.getSnapshot().status).toBe("playing");
    expect(env.timer.activeCount).toBe(1);
    env.run(2);
    expect(events.length).toBeGreaterThan(emittedBeforePause);

    const pairs = events.map((e) => `${e.channel}@${e.time}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const id of ["kick", "snare"]) {
      const times = events.filter((e) => e.channel === id).map((e) => e.time);
      times.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(times[i]!));
    }
    expect(events.every((e) => !e.late)).toBe(true);
  });

  it("resumes at the first uncommitted tick with the start delay", () => {
    const { env, transport, events, record } = setup();
    record("snare");
    transport.setLoop(makeLoop());
    transport.start();
    env.run(0.3); // last window ends at floor((0.3 + 0.1 - 0.05) * 192) = 67
    transport.pause();
    expect(transport.getPosition()).toEqual({ tick: 67 });
    env.run(1);
    transport.start(); // tick 67 at clock 1.35
    env.run(0.5);
    expect(events).toHaveLength(1);
    expect(events[0]!.tick).toBe(96);
    expect(events[0]!.time).toBeCloseTo(1.35 + (96 - 67) / 192, 9);
  });

  it("stop resets to tick 0 from playing, paused and stopped", () => {
    const { env, transport } = setup();
    transport.setLoop(makeLoop());

    transport.start();
    env.run(0.7);
    transport.stop();
    expect(transport.getSnapshot().status).toBe("stopped");
    expect(transport.getPosition()).toEqual({ tick: 0 });
    expect(env.timer.activeCount).toBe(0);

    transport.start();
    env.run(0.7);
    transport.pause();
    transport.stop(); // dilla regression: stop after pause must reset
    expect(transport.getSnapshot().status).toBe("stopped");
    expect(transport.getPosition()).toEqual({ tick: 0 });

    transport.stop();
    expect(transport.getSnapshot().status).toBe("stopped");
    expect(transport.getPosition()).toEqual({ tick: 0 });
  });

  it("start after stop plays from tick 0 again", () => {
    const { env, transport, events, record } = setup();
    record("kick");
    transport.setLoop(makeLoop());
    transport.start();
    env.run(0.7);
    transport.pause();
    transport.stop();
    events.length = 0;
    transport.start();
    env.run(0.2);
    expect(summary(events)).toEqual([["kick", 0, false]]);
    expect(events[0]!.time).toBeCloseTo(timeOf(0, 0.7), 9);
  });

  it("start while playing and pause while not playing are no-ops", () => {
    const { env, transport } = setup();
    transport.setLoop(makeLoop());
    const listener = vi.fn();
    transport.subscribe(listener);

    transport.pause();
    expect(transport.getSnapshot().status).toBe("stopped");
    expect(listener).not.toHaveBeenCalled();

    transport.start();
    const snapshot = transport.getSnapshot();
    transport.start();
    expect(env.timer.activeCount).toBe(1);
    expect(transport.getSnapshot()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);

    transport.pause();
    transport.pause();
    expect(transport.getSnapshot().status).toBe("paused");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("plays silently with no loop, and starts emitting once a loop is set", () => {
    const { env, transport, events, record, onError } = setup();
    record("kick");
    transport.start();
    expect(transport.getSnapshot()).toEqual({ status: "playing", loop: null });
    env.run(1);
    expect(events).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(transport.getPosition()).toBeNull();

    transport.setLoop(makeLoop());
    env.run(1);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.tick).toBe(0);
    expect(events.every((e) => !e.late)).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["no channels", {}],
    ["an empty channel", { kick: [] }],
  ])("plays a loop with %s silently", (_name, channels) => {
    const { env, transport, events, record, onError } = setup();
    record("kick");
    transport.setLoop({ ...makeLoop(), channels });
    transport.start();
    env.run(3);
    expect(events).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(transport.getPosition()).not.toBeNull();
  });

  it("reports the loop-relative position on the scheduled timeline", () => {
    const { env, transport } = setup();
    transport.setLoop(makeLoop());
    expect(transport.getPosition()).toEqual({ tick: 0 });
    transport.start();
    expect(transport.getPosition()).toEqual({ tick: 0 }); // clock 0, before the 0.05 start
    expect(transport.getPosition(0.01)).toEqual({ tick: 0 });
    env.clock.set(0.55);
    expect(transport.getPosition()).toEqual({ tick: 96 });
    expect(transport.getPosition(timeOf(200))).toEqual({ tick: 200 });
    expect(transport.getPosition(timeOf(384 + 10))).toEqual({ tick: 10 });
  });

  it("emits every note of a stalled interval, in order, marking past ones late", () => {
    const { env, transport, events, record } = setup();
    record("kick");
    record("snare");
    transport.setLoop(makeLoop());
    transport.start();
    env.run(0.2); // committed up to floor((0.2 + 0.1 - 0.05) * 192) = 48
    const before = events.length;
    env.clock.advance(1.0);
    env.timer.fire(); // window [48, floor((1.2 + 0.1 - 0.05) * 192)) = [48, 240)

    const now = env.clock.now();
    const expected: [string, number, number, boolean][] = [];
    for (let abs = 48; abs < 240; abs++) {
      const rel = abs % 384;
      for (const [id, ats] of [["kick", [0, 192]], ["snare", [96]]] as const) {
        if ((ats as readonly number[]).includes(rel)) expected.push([id, rel, timeOf(abs), timeOf(abs) < now]);
      }
    }
    const stalled = events.slice(before);
    expect(stalled.map((e) => [e.channel, e.tick, e.late])).toEqual(expected.map(([c, t, , late]) => [c, t, late]));
    stalled.forEach((e, i) => expect(e.time).toBeCloseTo(expected[i]![2], 9));
    expect(expected.length).toBe(2);
    expect(stalled.every((e) => e.late)).toBe(true);
  });

  it("dispose is idempotent and turns every later call into a no-op", () => {
    const { env, transport, events, record } = setup();
    const listener = vi.fn();
    transport.subscribe(listener);
    record("kick");
    transport.setLoop(makeLoop());
    transport.start();
    listener.mockClear();

    transport.dispose();
    expect(env.timer.activeCount).toBe(0);
    expect(() => transport.dispose()).not.toThrow();

    const L2 = makeLoop();
    expect(() => {
      transport.start();
      transport.setLoop(L2);
      transport.pause();
      transport.stop();
      transport.channel("kick", () => {
        throw new Error("must not be called");
      })();
      transport.subscribe(listener)();
      transport.getSnapshot();
      transport.getPosition();
    }).not.toThrow();
    events.length = 0;
    env.run(2);
    expect(events).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect(env.timer.activeCount).toBe(0);
  });

  it("never leaks or double-registers the timer when a subscriber pauses on seeing playing", () => {
    const env = createFakeEnv();
    let clockReads = 0;
    const clock = { now: () => (clockReads++, env.clock.now()) };
    const transport = createTransport({ clock, timer: env.timer, onError: vi.fn() });
    transport.setLoop(makeLoop());
    let pauseOnPlaying = true;
    transport.subscribe(() => {
      if (pauseOnPlaying && transport.getSnapshot().status === "playing") transport.pause();
    });

    transport.start();
    expect(transport.getSnapshot().status).toBe("paused");
    expect(env.timer.activeCount).toBe(0);

    pauseOnPlaying = false;
    transport.start();
    expect(transport.getSnapshot().status).toBe("playing");
    expect(env.timer.activeCount).toBe(1);

    transport.dispose();
    expect(env.timer.activeCount).toBe(0);
    clockReads = 0;
    env.run(1);
    env.timer.fire();
    expect(clockReads).toBe(0);
  });

  it("keeps the timer running when a subscriber throws on start", () => {
    const { env, transport, events, record } = setup();
    record("kick");
    transport.setLoop(makeLoop());
    const boom = new Error("boom");
    transport.subscribe(() => {
      throw boom;
    });
    expect(() => transport.start()).toThrow(boom);
    expect(transport.getSnapshot().status).toBe("playing");
    expect(env.timer.activeCount).toBe(1);
    env.run(1.2);
    expect(events.map((e) => e.tick)).toEqual([0, 192]);
  });

  it("keeps two transports fully isolated", () => {
    const a = setup();
    const b = setup();
    a.record("kick");
    b.record("kick");
    a.transport.setLoop(makeLoop());
    b.transport.setLoop({ ...makeLoop(), channels: { kick: [{ at: 48 }] } });
    a.transport.start();
    b.transport.start();

    a.env.run(1);
    expect(a.events.map((e) => e.tick)).toEqual([0, 192]);
    expect(b.events).toEqual([]);

    b.env.run(1);
    expect(b.events.map((e) => e.tick)).toEqual([48]);
    expect(a.events).toHaveLength(2);
  });

  it("gives a live transport after create, dispose, create on the same env", () => {
    const env: FakeEnv = createFakeEnv();
    const first: Transport = createTransport({ clock: env.clock, timer: env.timer });
    first.setLoop(makeLoop());
    first.start();
    first.dispose();

    const second = createTransport({ clock: env.clock, timer: env.timer });
    const ticks: number[] = [];
    second.channel("kick", (e) => void ticks.push(e.tick));
    second.setLoop(makeLoop());
    second.start();
    expect(env.timer.activeCount).toBe(1);
    env.run(1.2);
    expect(ticks).toEqual([0, 192]);
  });
});
