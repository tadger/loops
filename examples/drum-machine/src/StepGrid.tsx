import type { Loop } from "@loops/core";
import { CHANNELS, isStepOn } from "./loop-state";

const STEPS = 16;
const STEP_INDEXES = Array.from({ length: STEPS }, (_, i) => i);

export interface StepGridProps {
  loop: Loop;
  onToggle(channel: string, step: number): void;
  playheadStep: number | null;
}

export function StepGrid({ loop, onToggle, playheadStep }: StepGridProps): React.JSX.Element {
  return (
    <div className="step-grid" role="group" aria-label="Step sequencer">
      {CHANNELS.map((channel) => (
        <div className="step-row" key={channel}>
          <span className="step-label">{channel}</span>
          {STEP_INDEXES.map((step) => (
            <button
              key={step}
              type="button"
              className="step"
              aria-label={`${channel} step ${step + 1}`}
              aria-pressed={isStepOn(loop, channel, step)}
              data-playhead={step === playheadStep ? "" : undefined}
              data-beat={step % 4 === 0 ? "" : undefined}
              onClick={() => onToggle(channel, step)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
