import { describe, expect, it, vi } from "vitest";
import { loadSamples, playSample, SAMPLE_URLS } from "../src/samples";
import { DECAY_MAX } from "../src/step-data";
import { fakeGain } from "./audio-param";

const buffer = (id: string) => ({ id }) as unknown as AudioBuffer;

describe("SAMPLE_URLS", () => {
  it("maps each channel to its wav", () => {
    expect(SAMPLE_URLS).toEqual({
      kick: "/samples/kick.wav",
      sd: "/samples/sd.wav",
      chh: "/samples/chh.wav",
      clap: "/samples/clap.wav",
    });
  });
});

describe("loadSamples", () => {
  it("fetches and decodes each sample, keyed by channel", async () => {
    const bytes = new Map(Object.entries(SAMPLE_URLS).map(([id, url]) => [url, new ArrayBuffer(id.length)]));
    const fetchFn = vi.fn(async (url: string) => ({ ok: true, arrayBuffer: async () => bytes.get(url)! }) as Response);
    const decodeAudioData = vi.fn(async (b: ArrayBuffer) => buffer(String(b.byteLength)));

    const samples = await loadSamples({ decodeAudioData }, fetchFn as unknown as typeof fetch);

    expect(fetchFn.mock.calls.map(([url]) => url).sort()).toEqual(Object.values(SAMPLE_URLS).sort());
    expect(decodeAudioData).toHaveBeenCalledTimes(Object.keys(SAMPLE_URLS).length);
    expect(Object.keys(samples).sort()).toEqual(Object.keys(SAMPLE_URLS).sort());
    expect(samples.kick).toEqual(buffer("4"));
    expect(samples.sd).toEqual(buffer("2"));
    expect(samples.chh).toEqual(buffer("3"));
    expect(samples.clap).toEqual(buffer("4"));
  });
});

describe("loadSamples failures", () => {
  it("throws naming the url when a response is not ok", async () => {
    const fetchFn = vi.fn(async (url: string) => ({ ok: url !== "/samples/sd.wav", arrayBuffer: async () => new ArrayBuffer(1) }) as Response);
    const decodeAudioData = vi.fn(async () => buffer("x"));

    await expect(loadSamples({ decodeAudioData }, fetchFn as unknown as typeof fetch)).rejects.toThrow("failed to load /samples/sd.wav");
  });
});

describe("playSample", () => {
  const T = 3;
  const base = { gain: 0.8, decay: DECAY_MAX, rate: 1 };

  function setup() {
    const gain = fakeGain();
    const destination = {};
    const source = {
      buffer: null as unknown,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const ctx = { destination, createBufferSource: () => source, createGain: () => gain };
    return { gain, destination, source, ctx: ctx as unknown as BaseAudioContext };
  }

  it("routes the buffer through the gain node to the destination, and starts it", () => {
    const { ctx, gain, source, destination } = setup();
    const buf = buffer("kick");
    const gainConnect = vi.spyOn(gain, "connect");

    playSample(ctx, buf, T, base);

    expect(source.buffer).toBe(buf);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gainConnect).toHaveBeenCalledWith(destination);
    expect(source.start).toHaveBeenCalledWith(T);
  });

  it("connects to opts.output instead of the destination when given", () => {
    const { ctx, gain } = setup();
    const output = {} as AudioNode;
    const gainConnect = vi.spyOn(gain, "connect");

    playSample(ctx, buffer("kick"), T, base, { output });

    expect(gainConnect).toHaveBeenCalledExactlyOnceWith(output);
  });

  it("sets the playback rate", () => {
    const { ctx, source } = setup();
    playSample(ctx, buffer("kick"), T, { ...base, rate: 0.55 });
    expect(source.playbackRate.value).toBe(0.55);
  });

  it("plays the whole sample at a flat gain with no duration and decay off", () => {
    const { ctx, gain, source } = setup();

    playSample(ctx, buffer("kick"), T, base);

    expect(gain.events).toEqual([{ kind: "set", value: 0.8, time: T }]);
    expect(gain.levelAt(T + 5)).toBe(0.8);
    expect(source.stop).not.toHaveBeenCalled();
  });

  it("decays linearly to silence with no duration", () => {
    const { ctx, gain } = setup();

    playSample(ctx, buffer("kick"), T, { ...base, decay: 0.5 });

    expect(gain.levelAt(T)).toBe(0.8);
    expect(gain.levelAt(T + 0.25)).toBeCloseTo(0.4);
    expect(gain.levelAt(T + 0.5)).toBe(0);
    expect(gain.levelAt(T + 1)).toBe(0);
  });

  it("holds a sustained note flat between a fade-in and a fade-out when decay is off", () => {
    const { ctx, gain, source } = setup();

    playSample(ctx, buffer("kick"), T, base, { duration: 0.3 });

    expect(gain.levelAt(T)).toBe(0);
    expect(gain.levelAt(T + 0.005)).toBeCloseTo(0.4);
    expect(gain.levelAt(T + 0.01)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.2)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.3)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.305)).toBeCloseTo(0.4);
    expect(gain.levelAt(T + 0.31)).toBe(0);
    expect(source.stop).toHaveBeenCalledExactlyOnceWith(T + 0.3 + 0.01);
  });

  it("ends on the decay with no end fade when decay <= duration", () => {
    const { ctx, gain } = setup();

    playSample(ctx, buffer("kick"), T, { ...base, decay: 0.1 }, { duration: 0.3 });

    expect(gain.levelAt(T + 0.01)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.055)).toBeCloseTo(0.4);
    expect(gain.levelAt(T + 0.1)).toBe(0);
    expect(gain.events.every((e) => e.time <= T + 0.1)).toBe(true);
  });

  it("cuts a note off the decay line, then fades out, when decay > duration", () => {
    const { ctx, gain, source } = setup();
    const fade = 0.01;

    playSample(ctx, buffer("kick"), T, { ...base, decay: 1 }, { duration: 0.1 });

    const onLine = 0.8 * (1 - (0.1 - fade) / (1 - fade));
    expect(gain.levelAt(T + fade)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.1)).toBeCloseTo(onLine);
    expect(gain.levelAt(T + 0.1 + fade / 2)).toBeCloseTo(onLine / 2);
    expect(gain.levelAt(T + 0.1 + fade)).toBe(0);
    expect(source.stop).toHaveBeenCalledExactlyOnceWith(T + 0.1 + fade);
  });

  it("halves the fade for a very short note and keeps event times strictly increasing", () => {
    const { ctx, gain, source } = setup();

    playSample(ctx, buffer("kick"), T, base, { duration: 0.005 });

    const times = gain.events.map((e) => e.time);
    expect(times).toEqual([T, T + 0.0025, T + 0.005, T + 0.0075]);
    expect(source.stop).toHaveBeenCalledExactlyOnceWith(T + 0.0075);
    expect(gain.levelAt(T + 0.0025)).toBeCloseTo(0.8);
    expect(gain.levelAt(T + 0.0075)).toBe(0);
  });
});
