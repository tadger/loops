import type { Loop } from "@loops/core";
import { CHANNELS, isStepOn, stepsPerBar } from "./loop-state";

export interface StepGridProps {
  loop: Loop;
  onToggle(channel: string, step: number): void;
  playheadStep: number | null;
  muted: ReadonlySet<string>;
  onToggleMute(channel: string): void;
  onSetAllMuted(muted: boolean): void;
}

export function StepGrid({ loop, onToggle, playheadStep, muted, onToggleMute, onSetAllMuted }: StepGridProps): React.JSX.Element {
  const perBar = stepsPerBar(loop);
  const barSteps = Array.from({ length: perBar }, (_, i) => i);
  const allMuted = CHANNELS.every((c) => muted.has(c));
  return (
    <div className="step-grid" role="group" aria-label="Step sequencer">
      <div className="grid-toolbar">
        <button type="button" onClick={() => onSetAllMuted(!allMuted)}>
          {allMuted ? "Unmute all" : "Mute all"}
        </button>
      </div>
      {Array.from({ length: loop.bars }, (_, bar) => (
        <div
          className="step-bar"
          key={bar}
          role="group"
          aria-labelledby={`step-bar-${bar}-heading`}
          style={{ "--steps": perBar } as React.CSSProperties}
        >
          <div className="bar-heading" id={`step-bar-${bar}-heading`}>
            Bar {bar + 1}
          </div>
          {CHANNELS.map((channel) => (
            <div className="step-row" key={channel} data-muted={muted.has(channel) ? "" : undefined}>
              <button
                type="button"
                className="step-label"
                aria-pressed={muted.has(channel)}
                onClick={() => onToggleMute(channel)}
              >
                {channel}
              </button>
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
