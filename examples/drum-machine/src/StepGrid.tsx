import { useEffect, useRef, useState } from "react";
import type { Loop } from "@loops/core";
import { ConfirmDialog } from "./ConfirmDialog";
import { CHANNELS, isStepOn, stepsInBar, stepsPerBar } from "./loop-state";

export interface StepGridProps {
  loop: Loop;
  onToggle(channel: string, step: number): void;
  playheadStep: number | null;
  muted: ReadonlySet<string>;
  onToggleMute(channel: string): void;
  onSetAllMuted(muted: boolean): void;
  onAddBar(): void;
  onRemoveBar(bar: number): void;
}

export function StepGrid({
  loop,
  onToggle,
  playheadStep,
  muted,
  onToggleMute,
  onSetAllMuted,
  onAddBar,
  onRemoveBar,
}: StepGridProps): React.JSX.Element {
  const [pendingBar, setPendingBar] = useState<number | null>(null);
  const removeButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfterRemove = useRef<number | null>(null);

  // The bar that was removed takes its button with it (or the button becomes disabled), so hand focus on.
  useEffect(() => {
    const removed = focusAfterRemove.current;
    if (removed === null) return;
    focusAfterRemove.current = null;
    const target = removeButtons.current[Math.min(removed, loop.bars - 1)];
    (target && !target.disabled ? target : addButton.current)?.focus();
  }, [loop]);
  const perBar = stepsPerBar(loop);
  const barSteps = Array.from({ length: perBar }, (_, i) => i);
  const allMuted = CHANNELS.every((c) => muted.has(c));
  // A removal that shrank the loop under an open prompt leaves nothing to confirm.
  const pending = pendingBar !== null && pendingBar < loop.bars ? pendingBar : null;
  const pendingSteps = pending === null ? 0 : stepsInBar(loop, pending);

  const removeNow = (bar: number) => {
    focusAfterRemove.current = bar;
    onRemoveBar(bar);
  };
  const requestRemove = (bar: number) => {
    if (stepsInBar(loop, bar) === 0) removeNow(bar);
    else setPendingBar(bar);
  };
  return (
    <div className="step-grid" role="group" aria-label="Step sequencer">
      <div className="grid-toolbar">
        <button type="button" className="topcoat-button" onClick={() => onSetAllMuted(!allMuted)}>
          {allMuted ? "Unmute all" : "Mute all"}
        </button>
        <button type="button" className="topcoat-button" ref={addButton} onClick={onAddBar}>
          Add bar
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
          <div className="flex items-center justify-between">
            <div className="bar-heading" id={`step-bar-${bar}-heading`}>
              Bar {bar + 1}
            </div>
            <button
              type="button"
              className="topcoat-button"
              ref={(el) => {
                removeButtons.current[bar] = el;
              }}
              aria-label={`Remove bar ${bar + 1}`}
              disabled={loop.bars === 1}
              onClick={() => requestRemove(bar)}
            >
              Remove
            </button>
          </div>
          {CHANNELS.map((channel) => (
            <div className="step-row" key={channel} data-muted={muted.has(channel) ? "" : undefined}>
              <button
                type="button"
                className="step-label lcd"
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
      <ConfirmDialog
        open={pending !== null}
        title={`Remove bar ${(pending ?? 0) + 1}?`}
        confirmLabel="Remove bar"
        onConfirm={() => {
          if (pending !== null) removeNow(pending);
          setPendingBar(null);
        }}
        onCancel={() => setPendingBar(null)}
      >
        {`Bar ${(pending ?? 0) + 1} has ${pendingSteps} ${pendingSteps === 1 ? "step" : "steps"}. Removing it deletes ${pendingSteps === 1 ? "it" : "them"}.`}
      </ConfirmDialog>
    </div>
  );
}
