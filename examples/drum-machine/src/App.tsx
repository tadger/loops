import { useState } from "react";
import type { Loop } from "@loops/core";
import { TransportProvider } from "@loops/react";
import { inertClock, inertTimer } from "./audio";
import { Machine } from "./Machine";
import { createInitialLoop } from "./loop-state";
import { loadLoop, saveLoop } from "./persistence";
import { useAudioSetup } from "./use-audio-setup";

function initialLoop(): Loop {
  const saved = loadLoop(localStorage);
  return saved?.ok ? saved.loop : createInitialLoop();
}

export function App() {
  const [loop, setLoopState] = useState(initialLoop);
  const { audio, loading, error, startRequested, markStarted, prepare } = useAudioSetup();

  const edit = (next: Loop) => {
    setLoopState(next);
    saveLoop(localStorage, next);
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
        />
      </TransportProvider>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}
