import { useRef } from "react";
import type { Loop } from "@loops/core";
import { Dial } from "./Dial";
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
  const rows = useRef<Record<number, HTMLDivElement | null>>({});

  // A disabled dial can't take focus anyway (the browser enforces that), so there's nothing to
  // fall back to when every step in the bar is off.
  const focusFirstDial = (bar: number) => {
    rows.current[bar]?.querySelector<HTMLInputElement>('input[type="range"]:not(:disabled)')?.focus();
  };

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
        <div className="lane" key={bar} role="group" aria-label={`Bar ${bar + 1} ${active.label}`} ref={(el) => void (rows.current[bar] = el)}>
          <button type="button" className="step-label" onClick={() => focusFirstDial(bar)}>
            bar {bar + 1}
          </button>
          {barSteps.map((i) => {
            const step = bar * perBar + i;
            const current = active.get(loop, channel, step);
            const value = current ?? active.defaultValue;
            return (
              <Dial
                key={step}
                value={value}
                min={active.min}
                max={active.max}
                step={active.step}
                defaultValue={active.defaultValue}
                disabled={current === null}
                label={`${channel} step ${step + 1} ${active.label}`}
                format={active.format}
                onChange={(v) => onEdit(active.set(loop, channel, step, v))}
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}
