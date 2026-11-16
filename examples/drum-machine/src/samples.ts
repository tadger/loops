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
      return [id, await ctx.decodeAudioData(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function playSample(ctx: BaseAudioContext, buffer: AudioBuffer, time: number, gain: number): void {
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  source.buffer = buffer;
  gainNode.gain.value = gain;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(time);
}
