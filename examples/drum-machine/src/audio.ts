import type { Clock, Timer } from "@loops/core";

export interface Audio {
  ctx: AudioContext;
  samples: Record<string, AudioBuffer>;
  clock: Clock;
  timer: Timer;
  output: AudioNode;
}

// Stand-ins until the first Play click creates the AudioContext.
export const inertClock: Clock = { now: () => 0 };
export const inertTimer: Timer = { every: () => () => {} };

export function createMasterBus(ctx: Pick<AudioContext, "createDynamicsCompressor" | "destination">): AudioNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0;
  compressor.release.value = 0.25;
  compressor.connect(ctx.destination);
  return compressor;
}
