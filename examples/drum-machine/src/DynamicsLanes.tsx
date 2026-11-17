import type { Loop } from "@loops/core";
import { CHANNELS, getStepData } from "./loop-state";
import type { StepData } from "./step-data";
import { DECAY_MAX, DECAY_MIN, DEFAULT_STEP_DATA } from "./step-data";

const STEPS = 16;
const STEP_INDEXES = Array.from({ length: STEPS }, (_, i) => i);

export interface DynamicsLanesProps {
  loop: Loop;
  channel: string;
  onChannelChange(channel: string): void;
  onChange(channel: string, step: number, patch: Partial<StepData>): void;
}

export function DynamicsLanes({ loop, channel, onChannelChange, onChange }: DynamicsLanesProps): React.JSX.Element {
  const data = STEP_INDEXES.map((step) => getStepData(loop, channel, step));
  return (
    <section className="dynamics" aria-label="Step dynamics">
      <label className="dynamics-picker">
        Dynamics for
        <select value={channel} onChange={(e) => onChannelChange(e.target.value)}>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="lane">
        <span className="step-label">gain</span>
        {STEP_INDEXES.map((step) => (
          <input
            key={step}
            type="range"
            min={0}
            max={1}
            step={0.01}
            aria-label={`${channel} step ${step + 1} gain`}
            value={(data[step] ?? DEFAULT_STEP_DATA).gain}
            disabled={data[step] === null}
            onChange={(e) => onChange(channel, step, { gain: e.target.valueAsNumber })}
          />
        ))}
      </div>
      <div className="lane">
        <span className="step-label">decay</span>
        {STEP_INDEXES.map((step) => (
          <input
            key={step}
            type="range"
            min={DECAY_MIN * 1000}
            max={DECAY_MAX * 1000}
            step={10}
            aria-label={`${channel} step ${step + 1} decay`}
            value={Math.round((data[step] ?? DEFAULT_STEP_DATA).decay * 1000)}
            disabled={data[step] === null}
            onChange={(e) => onChange(channel, step, { decay: e.target.valueAsNumber / 1000 })}
          />
        ))}
      </div>
    </section>
  );
}
