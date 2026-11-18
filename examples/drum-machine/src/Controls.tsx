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
      <button type="button" className="topcoat-button--cta" onClick={onPlay} disabled={loading || status === "playing"}>
        {loading ? "Loading…" : "Play"}
      </button>
      <button type="button" className="topcoat-button" onClick={onPause} disabled={status !== "playing"}>
        Pause
      </button>
      <button type="button" className="topcoat-button" onClick={onStop} disabled={status === "stopped"}>
        Stop
      </button>
      <label className="flex items-center gap-2">
        Tempo: <output>{tempo}</output> bpm
        <input type="range" className="topcoat-range" min={40} max={200} value={tempo} onChange={(e) => onTempo(Number(e.target.value))} />
      </label>
    </div>
  );
}
