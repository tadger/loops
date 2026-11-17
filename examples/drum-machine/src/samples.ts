import { DECAY_MAX } from "./step-data";
import type { StepData } from "./step-data";

export const SAMPLE_URLS: Record<string, string> = {
  kick: "/samples/kick.wav",
  sd: "/samples/sd.wav",
  chh: "/samples/chh.wav",
  clap: "/samples/clap.wav",
};

export async function loadSamples(
  ctx: { decodeAudioData(b: ArrayBuffer): Promise<AudioBuffer> },
  fetchFn: typeof fetch,
): Promise<Record<string, AudioBuffer>> {
  const entries = await Promise.all(
    Object.entries(SAMPLE_URLS).map(async ([id, url]) => {
      const response = await fetchFn(url);
      if (!response.ok) throw new Error(`failed to load ${url}`);
      return [id, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Longest fade at a sustained note's edges, so a gate never clicks. */
const MAX_FADE = 0.01;

export function playSample(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  time: number,
  data: StepData,
  opts: { duration?: number; output?: AudioNode } = {},
): void {
  const { duration, output = ctx.destination } = opts;
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  const param = gainNode.gain;
  source.buffer = buffer;
  source.playbackRate.value = data.rate;

  const decays = data.decay < DECAY_MAX;
  let stopAt: number | undefined;
  if (duration === undefined) {
    param.setValueAtTime(data.gain, time);
    if (decays) param.linearRampToValueAtTime(0, time + data.decay);
  } else {
    const fade = Math.min(MAX_FADE, duration / 2);
    param.setValueAtTime(0, time);
    param.linearRampToValueAtTime(data.gain, time + fade);
    if (!decays) {
      param.setValueAtTime(data.gain, time + duration);
      param.linearRampToValueAtTime(0, time + duration + fade);
    } else if (data.decay <= duration) {
      param.linearRampToValueAtTime(0, time + data.decay);
    } else {
      const slope = data.gain / (data.decay - fade);
      param.linearRampToValueAtTime(data.gain - slope * (duration - fade), time + duration);
      param.linearRampToValueAtTime(0, time + duration + fade);
    }
    stopAt = time + duration + fade;
  }

  source.connect(gainNode);
  gainNode.connect(output);
  source.start(time);
  if (stopAt !== undefined) source.stop(stopAt);
}
