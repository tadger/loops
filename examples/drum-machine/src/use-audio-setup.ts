import { useState } from "react";
import { createAudioClock, createWorkerTimer, ensureRunning } from "@loops/web-audio";
import { createMasterBus, type Audio } from "./audio";
import { loadSamples } from "./samples";

export function useAudioSetup() {
  const [audio, setAudio] = useState<Audio | null>(null);
  const [startRequested, setStartRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runs inside the click: browsers require a user gesture to create the AudioContext.
  const prepare = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const ctx = new AudioContext();
      await ensureRunning(ctx);
      const samples = await loadSamples(ctx, fetch);
      setAudio({
        ctx,
        samples,
        clock: createAudioClock(ctx),
        timer: createWorkerTimer(),
        output: createMasterBus(ctx),
      });
      setStartRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return { audio, loading, error, startRequested, markStarted: () => setStartRequested(false), prepare };
}
