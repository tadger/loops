import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Loop } from "../src/loop";
import { resize, setTempo, toggleNote } from "../src/loop-edit";
import { createFakeEnv } from "../src/testing";
import { createTransport } from "../src/transport";
import type { NoteEvent } from "../src/transport";

/** 1 bar of 4/4 at 120 bpm (384 ticks): kick at 0 and 192, snare at 96. */
function makeLoop(): Loop {
  return {
    version: 1,
    bars: 1,
    beatsPerBar: 4,
    tempo: 120,
    channels: { kick: [{ at: 0 }, { at: 192 }], snare: [{ at: 96 }] },
  };
}

/** 2 bars of 4/4 at 120 bpm (768 ticks): kick at 0, snare at 192. */
function makeTwoBarLoop(): Loop {
  return { version: 1, bars: 2, beatsPerBar: 4, tempo: 120, channels: { kick: [{ at: 0 }], snare: [{ at: 192 }] } };
}

/** Clock time of absolute tick `t` after `start()` at clock 0, at 120 bpm with the 50 ms start delay. */
const timeOf = (t: number) => 0.05 + (t * 60) / (120 * 96);

const CHANNELS = ["kick", "snare", "hat"];

/** A transport started at clock 0 with `loop` (if given), recording every event on every channel. */
function setup(loop: Loop | null = makeLoop()) {
  const env = createFakeEnv();
  const onError = vi.fn();
  const transport = createTransport({ clock: env.clock, timer: env.timer, onError });
  const events: NoteEvent[] = [];
  for (const id of CHANNELS) transport.channel(id, (e) => void events.push(e));
  if (loop !== null) transport.setLoop(loop);
  transport.start();
  return { env, transport, events, onError };
}

const pairs = (events: NoteEvent[]) => events.map((e) => [e.channel, e.time] as const);
const on = (events: NoteEvent[], channel: string) => events.filter((e) => e.channel === channel);

function expectNoRepeats(events: NoteEvent[]): void {
  const keys = events.map((e) => `${e.channel}@${e.time}`);
  expect(new Set(keys).size).toBe(keys.length);
}

function expectNonDecreasing(events: NoteEvent[]): void {
  for (let i = 1; i < events.length; i++) expect(events[i]!.time).toBeGreaterThanOrEqual(events[i - 1]!.time);
}

describe("transport live edit", () => {
  it("keeps unchanged notes exactly once at their original times (inv. 1, 2)", () => {
    const control = setup();
    control.env.run(3.5);

    const { env, transport, events } = setup();
    env.run(0.5);
    transport.setLoop(toggleNote(makeLoop(), "hat", 0));
    env.run(3);

    expectNoRepeats(events);
    const kickAndSnare = (list: NoteEvent[]) => pairs(list.filter((e) => e.channel !== "hat"));
    expect(kickAndSnare(events)).toEqual(kickAndSnare(control.events));
    expect(on(events, "hat").length).toBeGreaterThan(0);
  });

  it("never emits a note removed before its window is reached (inv. 3)", () => {
    const { env, transport, events } = setup();
    env.run(0.3); // horizon tick 67: the snare at 96 (0.55 s) is not committed yet
    transport.setLoop(toggleNote(makeLoop(), "snare", 96));
    env.run(3);
    expect(on(events, "snare")).toEqual([]);
  });

  it("does not cancel a committed note when it is removed (inv. 3)", () => {
    const { env, transport, events } = setup();
    env.run(0.5); // horizon tick 105: the snare at 96 is emitted
    expect(on(events, "snare")).toHaveLength(1);
    transport.setLoop(toggleNote(makeLoop(), "snare", 96));
    env.run(0.025);
    expect(on(events, "snare")).toHaveLength(1);
    env.run(3);
    expect(on(events, "snare")).toHaveLength(1);
    expect(on(events, "snare")[0]!.time).toBeCloseTo(0.55, 9);
  });

  it("emits a note added after the committed region in the same loop pass (inv. 4)", () => {
    const { env, transport, events } = setup();
    env.run(0.3);
    transport.setLoop(toggleNote(makeLoop(), "hat", 192));
    env.run(0.8);
    const hats = on(events, "hat");
    expect(hats).toHaveLength(1);
    expect(hats[0]!.time).toBeCloseTo(1.05, 9);
    expect(hats[0]!.tick).toBe(192);
  });

  it("emits a note added inside the committed region on the next loop pass (inv. 4)", () => {
    const { env, transport, events } = setup();
    env.run(0.5); // horizon tick 105; tick 100 (~0.5708 s) is committed
    transport.setLoop(toggleNote(makeLoop(), "hat", 100));
    env.run(1.5);
    expect(on(events, "hat")).toEqual([]);
    env.run(0.6);
    const hats = on(events, "hat");
    expect(hats).toHaveLength(1);
    expect(hats[0]!.time).toBeCloseTo(timeOf(384 + 100), 9);
    expect(hats[0]!.time).toBeCloseTo(2.5708, 4);
  });

  it("keeps times non-decreasing and never repeats a (channel, time) under random edits (inv. 5)", () => {
    const edit = fc.oneof(
      fc.record({ kind: fc.constant("toggle" as const), channel: fc.constantFrom(...CHANNELS), at: fc.nat(767) }),
      fc.record({ kind: fc.constant("tempo" as const), bpm: fc.integer({ min: 20, max: 400 }) }),
      fc.record({ kind: fc.constant("resize" as const), bars: fc.integer({ min: 1, max: 2 }) }),
    );
    const step = fc.record({ pumps: fc.integer({ min: 0, max: 12 }), edit });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25 }), (schedule) => {
        const { env, transport, events, onError } = setup();
        let loop = makeLoop();
        for (const { pumps, edit } of schedule) {
          env.run(pumps * 0.025);
          if (edit.kind === "toggle") loop = toggleNote(loop, edit.channel, edit.at % (loop.bars * 384));
          else if (edit.kind === "tempo") loop = setTempo(loop, edit.bpm);
          else loop = resize(loop, { bars: edit.bars }).loop;
          transport.setLoop(loop);
        }
        env.run(1);
        expectNonDecreasing(events);
        expectNoRepeats(events);
        expect(onError).not.toHaveBeenCalled();
      }),
    );
  });

  it("re-anchors a tempo change at scheduledUpTo without moving emitted times (inv. 6)", () => {
    const { env, transport, events } = setup();
    env.run(0.3); // B = 67
    const before = events.map((e) => ({ ...e }));
    expect(pairs(before)).toEqual([["kick", 0.05]]);
    transport.setLoop(setTempo(makeLoop(), 60));
    env.run(1);
    expect(events.slice(0, before.length)).toEqual(before);
    const snare = on(events, "snare");
    expect(snare).toHaveLength(1);
    expect(snare[0]!.time).toBeCloseTo(0.05 + (67 * 60) / (120 * 96) + ((96 - 67) * 60) / (60 * 96), 9);
    expectNonDecreasing(events);
  });

  it("moves the origin on a length change so the relative tick carries over (inv. 7)", () => {
    const { env, transport, events } = setup(makeTwoBarLoop());
    env.run(2.6); // B = 508
    transport.setLoop(resize(makeTwoBarLoop(), { bars: 1 }).loop);
    env.run(1.6);
    expect(events.map((e) => [e.channel, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 192],
      ["snare", 192],
      ["kick", 0],
    ]);
    const times = events.map((e) => e.time);
    expect(times[0]).toBeCloseTo(0.05, 9);
    expect(times[1]).toBeCloseTo(1.05, 9);
    expect(times[2]).toBeCloseTo(0.05 + (576 * 60) / (120 * 96), 9);
    expect(times[2]).toBeCloseTo(3.05, 9);
    expect(times[3]).toBeCloseTo(0.05 + (768 * 60) / (120 * 96), 9);
    expect(times[3]).toBeCloseTo(4.05, 9);
    expectNoRepeats(events);
  });

  it("carries the relative tick over when the loop grows (inv. 7)", () => {
    const { env, transport, events } = setup();
    env.run(2.6); // B = 508: relative tick 124 of the 1-bar loop, so the new origin is 384
    const emitted = events.length;
    transport.setLoop(resize(makeLoop(), { bars: 2 }).loop);
    env.run(1.6);
    const after = events.slice(emitted);
    expect(after.map((e) => [e.channel, e.tick])).toEqual([["kick", 192]]);
    expect(after[0]!.time).toBeCloseTo(timeOf(576), 9);
    expect(transport.getPosition(timeOf(600))).toEqual({ tick: 600 - 384 });
    expectNoRepeats(events);
  });

  it("applies a combined tempo and length change at the same scheduledUpTo (inv. 8)", () => {
    const { env, transport, events } = setup(makeTwoBarLoop());
    env.run(2.6); // B = 508; new origin 384 at the re-anchored 60 bpm
    transport.setLoop(resize(setTempo(makeTwoBarLoop(), 60), { bars: 1 }).loop);
    env.run(3);
    const atB = timeOf(508);
    expect(events.slice(2).map((e) => [e.channel, e.tick])).toEqual([
      ["snare", 192],
      ["kick", 0],
    ]);
    expect(events[2]!.time).toBeCloseTo(atB + (576 - 508) / 96, 9);
    expect(events[3]!.time).toBeCloseTo(atB + (768 - 508) / 96, 9);
    expectNonDecreasing(events);
  });

  it("treats many tempo edits with no clock advance like a single edit with the last tempo", () => {
    const dragged = setup();
    dragged.env.run(0.3);
    for (let i = 0; i < 50; i++) dragged.transport.setLoop(setTempo(makeLoop(), 61 + i));
    dragged.env.run(3);

    const single = setup();
    single.env.run(0.3);
    single.transport.setLoop(setTempo(makeLoop(), 110));
    single.env.run(3);

    expect(dragged.events).toEqual(single.events);
  });

  it("setLoop with the current loop mid-play changes nothing and does not notify", () => {
    const control = setup();
    control.env.run(3.3);

    const { env, transport, events } = setup();
    env.run(0.3);
    const listener = vi.fn();
    transport.subscribe(listener);
    const snapshot = transport.getSnapshot();
    const position = transport.getPosition(0.2);
    transport.setLoop(snapshot.loop!);
    expect(listener).not.toHaveBeenCalled();
    expect(transport.getSnapshot()).toBe(snapshot);
    expect(transport.getPosition(0.2)).toEqual(position);
    env.run(3);
    expect(events).toEqual(control.events);
  });

  it("setLoop while stopped updates the snapshot and the next start plays it from tick 0", () => {
    const { env, transport, events } = setup();
    env.run(1);
    transport.stop();
    events.length = 0;
    const next = setTempo(makeTwoBarLoop(), 60);
    transport.setLoop(next);
    expect(transport.getSnapshot()).toEqual({ status: "stopped", loop: next });
    expect(transport.getPosition()).toEqual({ tick: 0 });
    transport.start(); // at clock 1
    env.run(2.1);
    expect(events.map((e) => [e.channel, e.tick])).toEqual([
      ["kick", 0],
      ["snare", 192],
    ]);
    expect(events[0]!.time).toBeCloseTo(1.05, 9);
    expect(events[1]!.time).toBeCloseTo(1.05 + 192 / 96, 9);
  });

  it("setLoop while paused applies on resume with the position carried modulo the new length", () => {
    const { env, transport, events } = setup();
    env.run(0.5); // B = 105
    transport.pause();
    const emitted = events.length;
    transport.setLoop(resize(makeLoop(), { beatsPerBar: 1 }).loop); // 96 ticks, kick at 0
    expect(transport.getPosition()).toEqual({ tick: 105 % 96 });
    transport.start(); // resumes tick 105 at 0.55
    env.run(1);
    const resumed = events.slice(emitted);
    expect(resumed.map((e) => [e.channel, e.tick])).toEqual([
      ["kick", 0],
      ["kick", 0],
    ]);
    expect(resumed[0]!.time).toBeCloseTo(0.55 + (192 - 105) / 192, 9);
    expect(resumed[1]!.time).toBeCloseTo(0.55 + (288 - 105) / 192, 9);
    expectNoRepeats(events);
  });

  it("emits nothing and raises no error after an edit empties every channel", () => {
    const { env, transport, events, onError } = setup();
    env.run(0.3);
    const emitted = events.length;
    transport.setLoop({ ...makeLoop(), channels: { kick: [], snare: [] } });
    env.run(3);
    expect(events).toHaveLength(emitted);
    expect(onError).not.toHaveBeenCalled();
    expect(transport.getPosition()).not.toBeNull();
  });

  describe("first loop", () => {
    it("arriving mid-play starts at its tick 0 at scheduledUpTo, at its own tempo", () => {
      const { env, transport, events } = setup(null);
      env.run(1); // B = 201 at the default 120 bpm
      transport.setLoop(setTempo(makeLoop(), 60));
      env.run(2);
      const atB = timeOf(201);
      expect(events.map((e) => [e.channel, e.tick])).toEqual([
        ["kick", 0],
        ["snare", 96],
      ]);
      expect(events[0]!.time).toBeCloseTo(atB, 9);
      expect(events[1]!.time).toBeCloseTo(atB + 1, 9);
    });

    it("arriving mid-play reports tick 0, not the loop tail, for times before it starts", () => {
      const { env, transport } = setup(null);
      env.run(1);
      transport.setLoop(setTempo(makeLoop(), 60));
      expect(transport.getPosition(1)).toEqual({ tick: 0 });
      expect(transport.getPosition()).toEqual({ tick: 0 });
      expect(transport.getPosition(timeOf(201) + 0.5)).toEqual({ tick: 48 });
    });

    it("arriving while paused plays from its tick 0 on resume", () => {
      const { env, transport, events } = setup(null);
      env.run(1);
      transport.pause();
      transport.setLoop(makeLoop());
      expect(transport.getPosition()).toEqual({ tick: 0 });
      transport.start(); // at clock 1
      env.run(0.9);
      expect(events.map((e) => [e.channel, e.tick])).toEqual([
        ["kick", 0],
        ["snare", 96],
      ]);
      expect(events[0]!.time).toBeCloseTo(1.05, 9);
    });
  });

  describe("getPosition across edits", () => {
    it("keeps the old tempo for times before the re-anchor point", () => {
      const { env, transport } = setup();
      env.run(0.3); // B = 67
      transport.setLoop(setTempo(makeLoop(), 60));
      expect(transport.getPosition(0.3)).toEqual({ tick: 48 });
      expect(transport.getPosition(timeOf(60))).toEqual({ tick: 60 });
      expect(transport.getPosition(timeOf(67))).toEqual({ tick: 67 });
      expect(transport.getPosition(timeOf(67) + 0.5)).toEqual({ tick: 67 + 48 });
    });

    it("keeps the old origin and length for times before a length change", () => {
      const { env, transport } = setup(makeTwoBarLoop());
      env.run(2.6); // B = 508, new origin 384
      transport.setLoop(resize(makeTwoBarLoop(), { bars: 1 }).loop);
      expect(transport.getPosition(2.6)).toEqual({ tick: 489 });
      expect(transport.getPosition(timeOf(507))).toEqual({ tick: 507 });
      expect(transport.getPosition(timeOf(508))).toEqual({ tick: 508 - 384 });
      expect(transport.getPosition(timeOf(600))).toEqual({ tick: 600 - 384 });
    });

    it("stays continuous across several edits within one lookahead", () => {
      const { env, transport } = setup();
      env.run(0.3); // B = 67
      transport.setLoop(setTempo(makeLoop(), 60));
      env.run(0.025); // B = 69
      transport.setLoop(setTempo(makeLoop(), 90));
      expect(transport.getPosition(0.3)).toEqual({ tick: 48 });
      const at69 = timeOf(67) + 2 / 96;
      expect(transport.getPosition(at69 - 0.5 / 96)).toEqual({ tick: 68 });
      expect(transport.getPosition(at69 + 1)).toEqual({ tick: 69 + 144 });
    });

    it("clamps times long before the retained history to its start", () => {
      const { env, transport } = setup();
      env.run(0.3); // B = 67
      transport.setLoop(setTempo(makeLoop(), 60));
      env.run(3);
      transport.setLoop(setTempo(makeLoop(), 90));
      expect(transport.getPosition(0.3)).toEqual({ tick: 67 });
    });

    it("is not disturbed by a later setLoop with the current loop", () => {
      const { env, transport } = setup();
      env.run(0.3); // B = 67
      const slow = setTempo(makeLoop(), 60);
      transport.setLoop(slow);
      env.run(3);
      transport.setLoop(slow);
      expect(transport.getPosition(0.3)).toEqual({ tick: 48 });
    });
  });
});
