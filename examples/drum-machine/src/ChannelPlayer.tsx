import type { NoteEvent } from "@loops/core";
import { useChannel } from "@loops/react";
import type { Audio } from "./audio";
import { playSample } from "./samples";
import { readStepData } from "./step-data";

export function ChannelPlayer({ channel, audio, muted }: { channel: string; audio: Audio | null; muted: boolean }) {
  useChannel(channel, (e: NoteEvent) => {
    if (muted) return;
    const buffer = audio?.samples[channel];
    if (audio === null || buffer === undefined) return;
    playSample(audio.ctx, buffer, e.time, readStepData(e.note), { duration: e.duration, output: audio.output });
  });
  return null;
}
