import { useState } from "react";
import type { Loop } from "@loops/core";
import { TransportProvider } from "@loops/react";
import { inertClock, inertTimer } from "./audio";
import { createBoomBapLoop } from "./beats";
import { Machine } from "./Machine";
import { CHANNELS } from "./loop-state";
import { loadLoop, loadMutes, saveLoop, saveMutes } from "./persistence";
import { useAudioSetup } from "./use-audio-setup";

function initialLoop(): Loop {
  const saved = loadLoop(localStorage);
  return saved?.ok ? saved.loop : createBoomBapLoop();
}

export function App() {
  const [loop, setLoopState] = useState(initialLoop);
  const [muted, setMuted] = useState<ReadonlySet<string>>(() => loadMutes(localStorage));
  const { audio, loading, error, startRequested, markStarted, prepare } = useAudioSetup();

  const edit = (next: Loop) => {
    setLoopState(next);
    saveLoop(localStorage, next);
  };

  const toggleMute = (channel: string) => {
    const next = new Set(muted);
    if (next.has(channel)) next.delete(channel);
    else next.add(channel);
    saveMutes(localStorage, next);
    setMuted(next);
  };

  const setAllMuted = (value: boolean) => {
    const next = value ? new Set<string>(CHANNELS) : new Set<string>();
    saveMutes(localStorage, next);
    setMuted(next);
  };

  return (
    <main>
      <h1>loops drum machine</h1>
      <TransportProvider clock={audio?.clock ?? inertClock} timer={audio?.timer ?? inertTimer} loop={loop}>
        <Machine
          loop={loop}
          onEdit={edit}
          audio={audio}
          loading={loading}
          startRequested={startRequested}
          onStarted={markStarted}
          onPrepareAudio={prepare}
          muted={muted}
          onToggleMute={toggleMute}
          onSetAllMuted={setAllMuted}
        />
      </TransportProvider>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
