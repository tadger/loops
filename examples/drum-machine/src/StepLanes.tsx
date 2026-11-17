import type { Loop } from "@loops/core";
import { CHANNELS, stepsPerBar } from "./loop-state";
import { STEP_PARAMS } from "./params";
import type { StepParam } from "./params";

export interface StepLanesProps {
  loop: Loop;
  channel: string;
  param: StepParam["id"];
  onChannelChange(channel: string): void;
  onParamChange(param: StepParam["id"]): void;
  onEdit(loop: Loop): void;
}

export function StepLanes({ loop, channel, param, onChannelChange, onParamChange, onEdit }: StepLanesProps): React.JSX.Element {
  const active = STEP_PARAMS.find((p) => p.id === param) ?? STEP_PARAMS[0]!;
  const perBar = stepsPerBar(loop);
  const barSteps = Array.from({ length: perBar }, (_, i) => i);
  return (
    <section className="lanes" aria-label="Step parameters" style={{ "--steps": perBar } as React.CSSProperties}>
      <div className="lane-pickers">
        <label>
          Lane for
          <select value={channel} onChange={(e) => onChannelChange(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Parameter
          <select value={active.id} onChange={(e) => onParamChange(e.target.value as StepParam["id"])}>
            {STEP_PARAMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {Array.from({ length: loop.bars }, (_, bar) => (
        <div className="lane" key={bar} role="group" aria-label={`Bar ${bar + 1} ${active.label}`}>
          <span className="step-label">bar {bar + 1}</span>
          {barSteps.map((i) => {
            const step = bar * perBar + i;
            const current = active.get(loop, channel, step);
            const value = current ?? active.defaultValue;
            return (
              <input
                key={step}
                type="range"
                min={active.min}
                max={active.max}
                step={active.step}
                aria-label={`${channel} step ${step + 1} ${active.label}`}
                aria-valuetext={active.format(value)}
                value={value}
                disabled={current === null}
                onChange={(e) => onEdit(active.set(loop, channel, step, e.target.valueAsNumber))}
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}
