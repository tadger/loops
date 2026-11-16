import { describe, expect, it, vi } from "vitest";
import { loadSamples, playSample, SAMPLE_URLS } from "../src/samples";

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
  it("routes a buffer source through a gain node to the destination at the given time", () => {
    const destination = {};
    const gain = { gain: { value: 0 }, connect: vi.fn() };
    const source = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
    const ctx = {
      destination,
      createBufferSource: vi.fn(() => source),
      createGain: vi.fn(() => gain),
    };
    const buf = buffer("kick");

    playSample(ctx as unknown as BaseAudioContext, buf, 1.25, 0.5);

    expect(source.buffer).toBe(buf);
    expect(source.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(destination);
    expect(gain.gain.value).toBe(0.5);
    expect(source.start).toHaveBeenCalledWith(1.25);
  });
});
