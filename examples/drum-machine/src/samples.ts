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

export function playSample(ctx: BaseAudioContext, buffer: AudioBuffer, time: number, data: StepData): void {
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  source.buffer = buffer;
  if (data.attack > 0) {
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(data.gain, time + data.attack);
  } else {
    gainNode.gain.setValueAtTime(data.gain, time);
  }
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(time);
}
