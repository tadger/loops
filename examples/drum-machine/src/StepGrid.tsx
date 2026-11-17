import type { Loop } from "@loops/core";
import { CHANNELS, isStepOn, stepsPerBar } from "./loop-state";

export interface StepGridProps {
  loop: Loop;
  onToggle(channel: string, step: number): void;
  playheadStep: number | null;
}

export function StepGrid({ loop, onToggle, playheadStep }: StepGridProps): React.JSX.Element {
  const perBar = stepsPerBar(loop);
  const barSteps = Array.from({ length: perBar }, (_, i) => i);
  return (
    <div className="step-grid" role="group" aria-label="Step sequencer">
      {Array.from({ length: loop.bars }, (_, bar) => (
        <div
          className="step-bar"
          key={bar}
          role="group"
          aria-label={`Bar ${bar + 1}`}
          style={{ "--steps": perBar } as React.CSSProperties}
        >
          {CHANNELS.map((channel) => (
            <div className="step-row" key={channel}>
              <span className="step-label">{channel}</span>
              {barSteps.map((i) => {
                const step = bar * perBar + i;
                return (
                  <button
                    key={step}
                    type="button"
                    className="step"
                    aria-label={`${channel} step ${step + 1}`}
                    aria-pressed={isStepOn(loop, channel, step)}
                    data-playhead={step === playheadStep ? "" : undefined}
                    data-beat={i % 4 === 0 ? "" : undefined}
                    onClick={() => onToggle(channel, step)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
