# Demo Step Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-step gain and attack controls (per-channel lanes) to the drum-machine demo and split `App.tsx` into small components.

**Architecture:** Demo only. A typed `StepData` payload lives in each note's `data`; pure helpers read and write it; `playSample` turns it into a gain envelope; `DynamicsLanes` edits it through `setStepData` → `onEdit` → controlled `loop` prop. `App.tsx` is decomposed behavior-preservingly first.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library (jsdom), Vite; run tooling with `pnpm` (installed via nvm/corepack; if the shell predates the migration, prefix `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`).

**Spec:** `docs/superpowers/specs/2026-11-16-demo-step-dynamics-design.md`

## Global Constraints

- No changes to any `@loops/*` package; `data` stays opaque to the library.
- Payload per note: `{ gain: 0–1 (default 1), attack: 0–0.1 seconds (default 0) }`; the attack slider shows milliseconds (0–100) and stores seconds.
- Envelope: `attack > 0` → gain `setValueAtTime(0, t)` then `linearRampToValueAtTime(gain, t + attack)`; `attack == 0` → `setValueAtTime(gain, t)` with no ramp.
- `readStepData` never throws: missing, non-numeric, NaN or out-of-range values fall back to defaults or clamp.
- Toggling a step off and on resets it to the defaults; sliders are enabled only on lit steps.
- The loop is never mutated; edits return new loops (use `setChannel` from `@loops/core`).
- Slider accessible names: `"<channel> step <n> gain"` / `"<channel> step <n> attack"` (n is 1-based).
- Behavior of the first-Play flow, import/export, persistence, tempo and StrictMode is unchanged by the extraction.
- Strictly test-first for logic and components. Comment style: sparse and terse, only for a non-obvious why.

## Review Focus

1. A loop imported from before this change (`data: { gain: 1 }` only, or no `data`, or garbage like `"loud"`) must play at the defaults and render sliders without errors. ★ Task 1, Task 3.
2. Dragging a slider fires many `onChange` events in a row; each must produce a valid loop and must not touch other steps' values. ★ Task 3.
3. Importing a loop whose `bars`/`beatsPerBar` differ from the 16-step grid must not crash the lanes (only steps 1–16 of 4 channels are shown). ★ Task 3.
4. A slider for a step that is toggled off while the user is dragging it must not resurrect the note. ★ Task 1 (`setStepData` on an off step returns the same loop).

## File Structure

```
examples/drum-machine/src/
  step-data.ts         StepData, defaults, ranges, readStepData
  loop-state.ts        + getStepData, setStepData; new notes use DEFAULT_STEP_DATA
  samples.ts           playSample(ctx, buffer, time, data: StepData)
  use-audio-setup.ts   audio hook (moved out of App)
  audio.ts             Audio interface, inert clock/timer
  ChannelPlayer.tsx  Controls.tsx  Sharing.tsx  Machine.tsx  DynamicsLanes.tsx
  App.tsx              thin
examples/drum-machine/test/  step-data, loop-state, samples, Controls, Sharing, DynamicsLanes tests
```

Run a test file: `pnpm vitest run <path>`. Whole repo: `pnpm test`; typecheck: `pnpm typecheck`.

---

### Task 1: `StepData` and the envelope

**Files:**
- Create: `examples/drum-machine/src/step-data.ts`, `examples/drum-machine/test/step-data.test.ts`
- Modify: `examples/drum-machine/src/loop-state.ts`, `examples/drum-machine/src/samples.ts`, and their tests (`loop-state.test.ts`, `samples.test.ts`)

**Interfaces:**
- Consumes: `Loop`, `Note`, `setChannel`, `toggleNote` from `@loops/core`; existing `STEP_TICKS`, `CHANNELS`, `toggleStep`, `isStepOn`.
- Produces:
  - `step-data.ts`: `export interface StepData { gain: number; attack: number }`, `export const DEFAULT_STEP_DATA: StepData` (`{ gain: 1, attack: 0 }`), `export const ATTACK_MAX = 0.1`, `export function readStepData(note: Note): StepData`
  - `loop-state.ts`: `export function getStepData(loop: Loop, channel: string, step: number): StepData | null` (`null` when the step is off), `export function setStepData(loop: Loop, channel: string, step: number, patch: Partial<StepData>): Loop`
  - `samples.ts`: `export function playSample(ctx: BaseAudioContext, buffer: AudioBuffer, time: number, data: StepData): void`

- [ ] **Step 1: Write the failing tests.**
  - `step-data.test.ts`: `readStepData({ at: 0 })` → `{ gain: 1, attack: 0 }`; `readStepData({ at: 0, data: { gain: 0.4, attack: 0.05 } })` → exactly those; `{ gain: 2 }` clamps to 1, `{ gain: -1 }` to 0, `{ attack: 5 }` to `ATTACK_MAX`, `{ attack: -1 }` to 0; `{ gain: "loud" }`, `{ gain: NaN }`, `data: null`, `data: [1]`, `data: "x"` all fall back to the defaults ★ (review focus 1); a partial `{ gain: 0.5 }` keeps the default attack.
  - `loop-state.test.ts` (update/add): `createInitialLoop()` notes carry `data: { gain: 1, attack: 0 }`; `toggleStep` adds a note with that data; `getStepData` is `null` for an off step and the note's data for a lit one; `setStepData(l, "kick", 0, { gain: 0.3 })` changes only that note's gain (attack kept, other steps and channels' notes unchanged, other channels keep reference identity), clamps out-of-range patches, and does not mutate a frozen input; ★ `setStepData` on an off step returns the SAME loop object (review focus 4); `setStepData` with an unchanged value returns the same loop object.
  - `samples.test.ts` (update): with a fake context whose gain node records calls — `attack: 0, gain: 0.5` calls `gain.setValueAtTime(0.5, t)` and no `linearRampToValueAtTime`; `attack: 0.05, gain: 0.8` calls `setValueAtTime(0, t)` then `linearRampToValueAtTime(0.8, t + 0.05)` in that order, then `source.start(t)`; wiring (source → gain → destination) is unchanged; the previous `gain.value`-based assertions are replaced.
- [ ] **Step 2: Run** `pnpm vitest run examples/drum-machine/test`. Expected: FAIL (missing module / signature mismatch).
- [ ] **Step 3: Implement** `step-data.ts`, `getStepData`/`setStepData` (built on `setChannel`, replacing the one note at the step's tick with a note whose `data` is the merged, clamped `StepData`; the payload is exactly `{ gain, attack }`, other keys are dropped), and the new `playSample` envelope. `createInitialLoop` and `toggleStep` use `DEFAULT_STEP_DATA`.
- [ ] **Step 4: Run** the demo tests and `pnpm typecheck`. Expected: PASS. (`App.tsx` still calls the old `playSample` signature; update its single call site to `playSample(audio.ctx, buffer, e.time, readStepData(e.note))` so the workspace typechecks.)
- [ ] **Step 5: Commit** `git add -A examples/drum-machine && git commit -m "feat(demo): typed step data and attack/gain envelope"`

---

### Task 2: Split `App.tsx` into components (behavior-preserving)

**Files:**
- Create: `audio.ts`, `use-audio-setup.ts`, `ChannelPlayer.tsx`, `Controls.tsx`, `Sharing.tsx`, `Machine.tsx` (all in `examples/drum-machine/src/`), `test/Controls.test.tsx`, `test/Sharing.test.tsx`
- Modify: `examples/drum-machine/src/App.tsx` (becomes thin)

**Interfaces:**
- Consumes: Task 1's `readStepData`, `playSample`; existing `StepGrid`, `persistence`, `loop-state`, `samples`, `@loops/*`.
- Produces:
  - `audio.ts`: `export interface Audio { ctx: AudioContext; samples: Record<string, AudioBuffer>; clock: Clock; timer: Timer }`, `export const inertClock: Clock`, `export const inertTimer: Timer`
  - `use-audio-setup.ts`: `export function useAudioSetup(): { audio: Audio | null; loading: boolean; error: string | null; startRequested: boolean; markStarted(): void; prepare(): Promise<void> }` (same sequence as today: create context inside the click, `ensureRunning`, `loadSamples`, then set audio and request start)
  - `Controls.tsx`: `Controls(props: { status: "stopped" | "playing" | "paused"; loading: boolean; tempo: number; onPlay(): void; onPause(): void; onStop(): void; onTempo(bpm: number): void }): JSX.Element`
  - `Sharing.tsx`: `Sharing(props: { loop: Loop; onImport(loop: Loop): void }): JSX.Element` (the existing component, moved)
  - `ChannelPlayer.tsx`: `ChannelPlayer(props: { channel: string; audio: Audio | null }): null`
  - `Machine.tsx`: the current `Machine`, composed from the pieces above

- [ ] **Step 1: Write the failing tests** (jsdom):
  - `Controls.test.tsx`: Play is disabled while `loading` or `status === "playing"` and shows `Loading…` when loading; Pause enabled only when playing; Stop disabled only when stopped; clicking calls `onPlay`/`onPause`/`onStop`; the tempo slider has min 40, max 200 and `fireEvent.change` to 120 calls `onTempo(120)`; the tempo `<output>` shows the value.
  - `Sharing.test.tsx`: Export shows a read-only textarea with the loop's canonical JSON; Import with valid JSON calls `onImport` with a loop deep-equal to the parsed one and shows no alert; Import with `{nope` shows a list item containing `JSON` and does NOT call `onImport`; Import of a loop with `tempo: 0` lists an item whose text starts with `tempo`.
- [ ] **Step 2: Run** those two files. Expected: FAIL (modules missing).
- [ ] **Step 3: Move code** out of `App.tsx` into the files above, without changing behavior or markup (same buttons, labels, roles, classNames). `App.tsx` keeps: `loop` state with `initialLoop`/`saveLoop`, `useAudioSetup()`, `TransportProvider`, `Machine`, the error alert.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, and `pnpm --filter drum-machine build`. Expected: all green; existing tests (StepGrid, loop-state, persistence, samples) untouched and passing. Start the dev server in the background, confirm `/` and `/src/App.tsx` return HTTP 200, and stop it cleanly.
- [ ] **Step 5: Commit** `git add -A examples/drum-machine && git commit -m "refactor(demo): split App into focused components"`

---

### Task 3: `DynamicsLanes`

**Files:**
- Create: `examples/drum-machine/src/DynamicsLanes.tsx`, `examples/drum-machine/test/DynamicsLanes.test.tsx`
- Modify: `examples/drum-machine/src/Machine.tsx`, the demo's stylesheet (wherever grid styles live; add lane styles aligned to the 16 step columns)

**Interfaces:**
- Consumes: `Loop`, `CHANNELS`, `getStepData`, `setStepData`, `StepData`, `ATTACK_MAX`.
- Produces: `DynamicsLanes(props: { loop: Loop; channel: string; onChannelChange(channel: string): void; onChange(channel: string, step: number, patch: Partial<StepData>): void }): JSX.Element` — a labelled channel `<select>` (options from `CHANNELS`), then a row of 16 gain range inputs (0–1, step 0.01) and a row of 16 attack range inputs (0–100 ms, step 1; `onChange` receives seconds, i.e. `ms / 1000`), each named per Global Constraints, each `disabled` when `getStepData(...)` is `null`; slider values reflect the note's data.

- [ ] **Step 1: Write the failing tests** (jsdom; fixture: `createInitialLoop()` with `kick` lit at steps 0, 7, 10):
  - Renders 16 gain and 16 attack sliders for the picked channel; sliders for lit steps are enabled and the others disabled; names follow `"kick step 1 gain"` / `"kick step 1 attack"`.
  - Values reflect data: after `setStepData` gives step 7 `{ gain: 0.4, attack: 0.05 }`, the step-7 gain slider's value is `0.4` and the attack slider's value is `50`.
  - `fireEvent.change` on the step-7 gain slider to `0.25` calls `onChange("kick", 7, { gain: 0.25 })`; on the step-7 attack slider to `30` calls `onChange("kick", 7, { attack: 0.03 })`.
  - Changing the channel `<select>` to `sd` calls `onChannelChange("sd")`; rendering with `channel="sd"` shows the sd notes' states.
  - ★ A loop whose notes have garbage `data` (`"loud"`, `null`, missing) renders without throwing, with default slider values (gain 1, attack 0). ★ A 2-bar loop with notes beyond step 16 and an extra channel renders only 16 steps for the picked channel without throwing.
  - ★ Several consecutive `onChange` events applied via `setStepData` leave all other steps' data unchanged (a small integration test composing `DynamicsLanes` with a stateful wrapper holding the loop).
- [ ] **Step 2: Run** `pnpm vitest run examples/drum-machine/test/DynamicsLanes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `DynamicsLanes.tsx` and integrate it in `Machine.tsx` (state `laneChannel`, default `CHANNELS[0]`; `onChange` → `onEdit(setStepData(loop, channel, step, patch))`; place under `StepGrid`). Add CSS so each lane's 16 sliders align under the grid's columns (same column widths), vertical sliders are not required.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, `pnpm --filter drum-machine build`; start the dev server in the background, confirm `/` returns HTTP 200, stop it cleanly.
- [ ] **Step 5: Commit** `git add -A examples/drum-machine && git commit -m "feat(demo): per-step gain and attack lanes"`
- [ ] **Step 6: Manual acceptance (PENDING FOR THE AUTHOR; a subagent cannot listen):** (1) lowering a step's gain is audibly quieter on the next pass; (2) attack 100 ms makes that hit audibly soft-onset, 0 ms is the original; (3) dragging sliders while playing changes the next passes with no glitches or doubled hits; (4) Export contains `gain` and `attack`, Import restores them, reload restores them; (5) toggling a step off/on resets it to gain 1 / attack 0; (6) importing an older loop (`data: { gain: 1 }`) plays and shows default attack.

---

## Self-review

- **Spec coverage:** payload and defaults (T1), envelope (T1), defensive read (T1), lanes with picker (T3), accessible names (T3), live edit via `setChannel` → `setLoop` (T1 `setStepData` + T3 wiring), component split table (T2 + T3), non-goals respected (no library changes).
- **Type consistency:** `StepData`, `readStepData`, `getStepData`, `setStepData`, `playSample(…, data: StepData)` are defined in Task 1 and used by Tasks 2–3; `Audio` is defined in Task 2 and used by `ChannelPlayer`/`Machine`.
- **Known gap:** audible behavior can't be verified by the agents (Task 3 Step 6).
