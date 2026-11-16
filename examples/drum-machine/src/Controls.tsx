interface ControlsProps {
  status: "stopped" | "playing" | "paused";
  loading: boolean;
  tempo: number;
  onPlay(): void;
  onPause(): void;
  onStop(): void;
  onTempo(bpm: number): void;
}

export function Controls({ status, loading, tempo, onPlay, onPause, onStop, onTempo }: ControlsProps) {
  return (
    <div className="controls">
      <button type="button" onClick={onPlay} disabled={loading || status === "playing"}>
        {loading ? "Loading…" : "Play"}
      </button>
      <button type="button" onClick={onPause} disabled={status !== "playing"}>
        Pause
      </button>
      <button type="button" onClick={onStop} disabled={status === "stopped"}>
        Stop
      </button>
      <label>
        Tempo: <output>{tempo}</output> bpm
        <input type="range" min={40} max={200} value={tempo} onChange={(e) => onTempo(Number(e.target.value))} />
      </label>
    </div>
  );
}
