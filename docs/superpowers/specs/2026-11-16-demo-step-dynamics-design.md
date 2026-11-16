# Demo: per-step dynamics and component extraction — design

Status: **draft for approval** · Date: 2026-11-16 · Extends §10 of `2026-11-16-loops-design.md` · Demo only (`examples/drum-machine`); no library changes.

## Intent

The drum-machine demo should let you shape each step's loudness (**gain**) and onset softness (**attack**) while the loop plays, to show that a loop's per-note `data` payload is the consumer's to define. `App.tsx` (194 lines, five concerns) should also be split into small focused components so a reader can follow the demo.

## Decisions

Made by the author:
- Gain and attack are adjustable **in the demo**; the library does not interpret them (sequencing only; see the memory note on scope). `data` stays opaque to `@loops/*`.
- Controls are **per-channel lanes** (design B): a channel picker under the grid, plus two rows of 16 sliders (gain, attack) for the picked channel, each aligned under its step.
- `App.tsx` is split into small components for readability.

My calls (check these):
- Payload per note: `{ gain: number, attack: number }`. Gain 0–1 (default 1). Attack 0–0.1 seconds (default 0), shown to the user in milliseconds (0–100).
- Values are per step. A slider is only enabled on a lit step. Toggling a step off and on resets it to the defaults.
- Handler envelope: with `attack > 0` the gain starts at 0 and ramps linearly to `gain` over `attack` seconds from the note's start time; with `attack == 0` the level is set directly (no ramp).
- Reading `data` is defensive: missing, non-numeric, NaN or out-of-range values fall back to the defaults or clamp. This also covers imported loops that predate `attack`.
- Edits go through the existing `setChannel` helper, so the change reaches the transport via `setLoop` and lands within the next lookahead window, like step toggles.
- The first-Play choreography (inert clock/timer, `startRequested`) moves into one hook **unchanged in behavior**. Whether to redesign it is the separate open question from the final review.
- Sliders get accessible names (`"kick step 4 gain"`) and are keyboard-operable (native range inputs).

## Components (after the split)

| File | Job |
|---|---|
| `App.tsx` | Owns `loop` state and persistence; wires the audio hook, `TransportProvider` and `Machine`; shows the error alert |
| `use-audio-setup.ts` | The audio hook: create/resume the context in the click, load samples, expose `audio`, `loading`, `error`, `startRequested` |
| `Machine.tsx` | Transport hooks (status, playhead) and layout of the pieces below |
| `Controls.tsx` | Play / Pause / Stop buttons and the tempo slider (presentational) |
| `StepGrid.tsx` | Existing 4×16 on/off grid (unchanged) |
| `DynamicsLanes.tsx` | New: channel picker plus gain and attack sliders per step |
| `ChannelPlayer.tsx` | Registers a channel handler and plays the sample with the step's envelope |
| `Sharing.tsx` | Export and Import UI |
| `step-data.ts` | `StepData` type, defaults, ranges, and the defensive `readStepData` |

`loop-state.ts` gains `getStepData` and `setStepData`; `samples.ts`'s `playSample` takes a `StepData`.

## Non-goals

Release/decay or other envelope stages; per-channel master gain; changing any `@loops/*` package; redesigning the first-Play flow; undo.

## Verification

Test-first for all logic and for the new components (jsdom). Subagents can't listen, so the audible behavior is a manual check for the author: gain differences are audible; attack 100 ms makes a hit audibly soft-onset; dragging a slider while playing changes the very next passes without glitches; Export includes `gain` and `attack`; a reload restores them.
