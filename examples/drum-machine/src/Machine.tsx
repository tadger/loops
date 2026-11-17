import { useEffect, useState } from "react";
import { setTempo } from "@loops/core";
import type { Loop } from "@loops/core";
import { usePlayhead, useTransport, useTransportState } from "@loops/react";
import type { Audio } from "./audio";
import { createBoomBapLoop } from "./beats";
import { ChannelPlayer } from "./ChannelPlayer";
import { Controls } from "./Controls";
import { Sharing } from "./Sharing";
import { StepGrid } from "./StepGrid";
import { StepLanes } from "./StepLanes";
import { CHANNELS, STEP_TICKS, toggleStep } from "./loop-state";
import type { StepParam } from "./params";

interface MachineProps {
  loop: Loop;
  onEdit(loop: Loop): void;
  audio: Audio | null;
  loading: boolean;
  startRequested: boolean;
  onStarted(): void;
  onPrepareAudio(): Promise<void>;
}

export function Machine({ loop, onEdit, audio, loading, startRequested, onStarted, onPrepareAudio }: MachineProps) {
  const transport = useTransport();
  const status = useTransportState((s) => s.status);
  const loopApplied = useTransportState((s) => s.loop !== null);
  const [step, setStep] = useState<number | null>(null);
  const [laneChannel, setLaneChannel] = useState<string>(CHANNELS[0]);
  const [laneParam, setLaneParam] = useState<StepParam["id"]>("gain");

  usePlayhead((position) => setStep(position === null ? null : Math.floor(position.tick / STEP_TICKS)));

  // Wait for the provider to give the new transport its loop, so the first pass has the tempo.
  useEffect(() => {
    if (!startRequested || audio === null || !loopApplied) return;
    transport.start();
    onStarted();
  }, [startRequested, audio, loopApplied, transport, onStarted]);

  const play = () => {
    if (audio === null) void onPrepareAudio();
    else transport.start();
  };

  return (
    <>
      {CHANNELS.map((channel) => (
        <ChannelPlayer key={channel} channel={channel} audio={audio} />
      ))}
      <Controls
        status={status}
        loading={loading}
        tempo={loop.tempo}
        onPlay={play}
        onPause={() => transport.pause()}
        onStop={() => transport.stop()}
        onTempo={(bpm) => onEdit(setTempo(loop, bpm))}
      />
      <StepGrid
        loop={loop}
        onToggle={(channel, i) => onEdit(toggleStep(loop, channel, i))}
        playheadStep={status === "stopped" ? null : step}
      />
      <StepLanes
        loop={loop}
        channel={laneChannel}
        param={laneParam}
        onChannelChange={setLaneChannel}
        onParamChange={setLaneParam}
        onEdit={onEdit}
      />
      <Sharing loop={loop} onImport={onEdit} onReset={() => onEdit(createBoomBapLoop())} />
    </>
  );
}
