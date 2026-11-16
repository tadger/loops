import { useEffect, useRef, useState } from "react";
import { setTempo } from "@loops/core";
import type { Clock, Diagnostic, Loop, NoteEvent, Timer } from "@loops/core";
import { TransportProvider, useChannel, usePlayhead, useTransport, useTransportState } from "@loops/react";
import { createAudioClock, createWorkerTimer, ensureRunning } from "@loops/web-audio";
import { StepGrid } from "./StepGrid";
import { CHANNELS, createInitialLoop, STEP_TICKS, toggleStep } from "./loop-state";
import { exportLoop, importLoop, loadLoop, saveLoop } from "./persistence";
import { loadSamples, playSample } from "./samples";

interface Audio {
  ctx: AudioContext;
  samples: Record<string, AudioBuffer>;
  clock: Clock;
  timer: Timer;
}

// Stand-ins until the first Play click creates the AudioContext.
const inertClock: Clock = { now: () => 0 };
const inertTimer: Timer = { every: () => () => {} };

function initialLoop(): Loop {
  const saved = loadLoop(localStorage);
  return saved?.ok ? saved.loop : createInitialLoop();
}

export function App() {
  const [loop, setLoopState] = useState(initialLoop);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [startRequested, setStartRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (next: Loop) => {
    setLoopState(next);
    saveLoop(localStorage, next);
  };

  // Runs inside the click: browsers require a user gesture to create the AudioContext.
  const prepareAudio = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const ctx = new AudioContext();
      await ensureRunning(ctx);
      const samples = await loadSamples(ctx, fetch);
      setAudio({ ctx, samples, clock: createAudioClock(ctx), timer: createWorkerTimer() });
      setStartRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
          onStarted={() => setStartRequested(false)}
          onPrepareAudio={prepareAudio}
        />
      </TransportProvider>
      {error !== null && <p role="alert">{error}</p>}
    </main>
  );
}

interface MachineProps {
  loop: Loop;
  onEdit(loop: Loop): void;
  audio: Audio | null;
  loading: boolean;
  startRequested: boolean;
  onStarted(): void;
  onPrepareAudio(): Promise<void>;
}

function Machine({ loop, onEdit, audio, loading, startRequested, onStarted, onPrepareAudio }: MachineProps) {
  const transport = useTransport();
  const status = useTransportState((s) => s.status);
  const loopApplied = useTransportState((s) => s.loop !== null);
  const [step, setStep] = useState<number | null>(null);

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
      <div className="controls">
        <button type="button" onClick={play} disabled={loading || status === "playing"}>
          {loading ? "Loading…" : "Play"}
        </button>
        <button type="button" onClick={() => transport.pause()} disabled={status !== "playing"}>
          Pause
        </button>
        <button type="button" onClick={() => transport.stop()} disabled={status === "stopped"}>
          Stop
        </button>
        <label>
          Tempo: <output>{loop.tempo}</output> bpm
          <input
            type="range"
            min={40}
            max={200}
            value={loop.tempo}
            onChange={(e) => onEdit(setTempo(loop, Number(e.target.value)))}
          />
        </label>
      </div>
      <StepGrid
        loop={loop}
        onToggle={(channel, i) => onEdit(toggleStep(loop, channel, i))}
        playheadStep={status === "stopped" ? null : step}
      />
      <Sharing loop={loop} onImport={onEdit} />
    </>
  );
}

function ChannelPlayer({ channel, audio }: { channel: string; audio: Audio | null }) {
  useChannel(channel, (e: NoteEvent) => {
    const buffer = audio?.samples[channel];
    if (audio === null || buffer === undefined) return;
    const gain = (e.note.data as { gain?: number } | undefined)?.gain ?? 1;
    playSample(audio.ctx, buffer, e.time, gain);
  });
  return null;
}

function Sharing({ loop, onImport }: { loop: Loop; onImport(loop: Loop): void }) {
  const [exported, setExported] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const importRef = useRef<HTMLTextAreaElement>(null);

  const doImport = () => {
    const result = importLoop(text);
    if (result.ok) {
      setErrors([]);
      onImport(result.loop);
    } else {
      setErrors(result.errors);
      importRef.current?.focus();
    }
  };

  return (
    <section className="sharing">
      <div>
        <button type="button" onClick={() => setExported(exportLoop(loop))}>
          Export
        </button>
        {exported !== null && <textarea readOnly aria-label="Exported loop" value={exported} rows={10} />}
      </div>
      <div>
        <label htmlFor="import-text">Import loop JSON</label>
        <textarea id="import-text" ref={importRef} value={text} onChange={(e) => setText(e.target.value)} rows={10} />
        <button type="button" onClick={doImport}>
          Import
        </button>
        {errors.length > 0 && (
          <ul role="alert">
            {errors.map((d, i) => (
              <li key={i}>
                {d.path}: {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
