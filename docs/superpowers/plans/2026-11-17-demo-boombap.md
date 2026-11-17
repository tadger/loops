# Demo boom-bap beat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The drum-machine demo opens on Adam Renklint's two-bar, nine-channel boom-bap beat, and each step's gain, decay, pitch and timing can be edited while it plays.

**Architecture:** Demo-only change in `examples/drum-machine`. A step is the nearest 16th note to a note's `at`; the remainder is its timing nudge, stored in `at` itself. Per-step `data` becomes `{ gain, decay, rate }`. Lanes are driven by a small parameter table. One kit of nine samples replaces the four.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 5 (jsdom), the existing `@loops/*` packages (unchanged).

**Spec:** `docs/superpowers/specs/2026-11-17-demo-boombap-design.md` (read it; it is the authority). It supersedes the attack lane in `2026-11-16-demo-step-dynamics-design.md`.

## Global Constraints

- Change only `examples/drum-machine/**` (plus docs). Never edit `packages/*`.
- Run commands with `export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH` first, then plain `pnpm`. Verify with `pnpm test` and `pnpm typecheck` from the repo root; both must be green after every task.
- Test-first: write the failing test, watch it fail, then implement. Component tests use `@testing-library/react` under jsdom, as the existing ones do.
- Comments are terse and only for a non-obvious why. No narrating comments.
- `PPQN` 96; `STEP_TICKS` 24 (one 16th); 16 steps per 4/4 bar, so `stepsPerBar = beatsPerBar * 4`.
- Step nudge range is exactly `−11…+11` ticks (a nudge of ±12 is a tie between two steps).
- `gain` 0–1, default 1. `decay` 0.02–2 s, default 2 (means "off"). `rate` 0.25–2, default 1. Lane units: gain 0–1; decay in ms 20–2000; pitch in semitones −24…+12 (`12·log2(rate)`); timing in ticks.
- Sustained notes (`duration` present) fade in and out over `min(0.01, duration/2)` seconds. Master compressor: threshold −15, knee 30, ratio 12, attack 0, release 0.25.
- Tempo 88, `bars: 2`, `beatsPerBar: 4`. Storage key `loops-demo:loop:v2`.
- Aria names stay `"<channel> step <n> <parameter label>"`, `n` counting 1–32 through both bars.

## Review Focus

Inputs the spec implies but no happy-path test covers; each has a pinning test in the owning task:
1. A step-0 note nudged early (wraps to the loop end), whose `duration` then no longer fits; and a last-step note nudged late (stays inside the loop, at most 11 ticks past its step). (Task 1)
2. Imported loops: two notes mapping to the same step, an old `attack` key, garbage `data`, off-grid `at`. (Tasks 1, 2)
3. `decay` shorter than, longer than, and off relative to a note's `duration`; a `duration` under 20 ms. (Task 2)
4. Non-finite or out-of-range slider values reaching `setStepData`/`setNudge`. (Tasks 1, 2, 5)
5. An imported loop with 1 bar, 3 bars, `beatsPerBar` 3, or channels the kit lacks: the grid and lanes must render without crashing and ignore unknown channels. (Tasks 4, 5, 6)

---

### Task 1: Step model — nearest-step identity and nudge

**Files:**
- Modify: `examples/drum-machine/src/loop-state.ts`
- Test: `examples/drum-machine/test/loop-state.test.ts`

**Interfaces:**
- Produces (in `loop-state.ts`):
  - `stepsPerBar(loop: Pick<Loop, "beatsPerBar">): number` and `stepCount(loop: Pick<Loop, "bars" | "beatsPerBar">): number`.
  - `MAX_NUDGE = 11`.
  - `stepOf(loop, at: number): number` = `Math.round(at / STEP_TICKS) % stepCount(loop)`. `nudgeOf(at: number): number` = `at − Math.round(at / STEP_TICKS) * STEP_TICKS`.
  - `getNudge(loop, channel, step): number | null` (null when the step is off).
  - `setNudge(loop, channel, step, nudge: number): Loop`.
- Changes: `isStepOn`, `getStepData`, `setStepData`, `toggleStep` identify a step by `stepOf`, not `at === step * STEP_TICKS`. Where several notes map to one step, reads and edits use the first in channel order; turning the step off removes all of them. Existing signatures are otherwise unchanged; `toggleStep` still writes `data: DEFAULT_STEP_DATA` (Task 2 changes that).

- [ ] **Step 1: Write failing tests** in `loop-state.test.ts` (keep the existing ones passing; add a `describe("step identity and nudge")`). Use a 2-bar loop built inline with `channels: { kick: [...] }`:
  - `stepOf`: `at` 0→0, 50→2, 183→8, 761 (2 bars, 768 long)→0; `nudgeOf`: 50→2, 183→−9, 761→−7.
  - `isStepOn` is true for the nudged note's step (`at` 50 → step 2) and false for step 1.
  - `getNudge` returns 2 for `at` 50, null for an off step.
  - `setNudge(loop, "kick", 2, -3)` moves that note to `at` 45; the same loop reference comes back when the nudge is unchanged or the step is off.
  - `setNudge` clamps to ±11 and rounds to an integer: `setNudge(…, 99)` gives nudge 11; `NaN` leaves the loop unchanged.
  - Wrap: `setNudge(loop, "kick", 0, -7)` on a 768-tick loop gives `at` 761. `setNudge(loop, "kick", 31, 11)` (step 31 is `at` 744) gives `at` 755, no wrap. A step-0 note with `duration` 60 nudged −7 lands at 761 with `duration` trimmed to 7 (`at + duration` equals the loop length); the result still passes `parseLoop`.
  - `toggleStep` on a step whose note is nudged (`at` 50 → step 2) turns it off and removes it; toggling an off step adds a note at `step * 24`.
  - Two notes at `at` 48 and 50 (same step 2): `getNudge` reads the first; `toggleStep` removes both.
  - A 1-bar and a 3-beat loop: `stepCount` is 16 and 12.
  - Inputs are not mutated (`deepFreeze` the loop, as the existing tests do).

- [ ] **Step 2: Run to confirm failure**: `pnpm test examples/drum-machine/test/loop-state.test.ts` — fails on missing exports.

- [ ] **Step 3: Implement** the functions above. `setNudge` computes `at = ((step * STEP_TICKS + nudge) % length + length) % length` with `length = loopLength(loop)`, then trims `duration` to `length − at` when it would overflow, and writes via `setChannel`. Keep `noteAt` as the single "first note whose step matches" lookup.

- [ ] **Step 4: Run all tests and typecheck**; both green.

- [ ] **Step 5: Commit** — `feat(demo): identify steps by nearest 16th and add nudge`.

---

### Task 2: Step data — gain, decay, rate; envelope; sustained notes

**Files:**
- Modify: `src/step-data.ts`, `src/loop-state.ts`, `src/samples.ts`, `src/ChannelPlayer.tsx`, `src/DynamicsLanes.tsx`
- Modify tests: `test/step-data.test.ts`, `test/loop-state.test.ts`, `test/samples.test.ts`, `test/DynamicsLanes.test.tsx`
- Create: `test/audio-param.ts` (test helper)

**Interfaces:**
- Produces (`step-data.ts`):
  - `type StepData = { gain: number; decay: number; rate: number }` (alias, not interface, so it is assignable to `Json`).
  - `DEFAULT_STEP_DATA`, `DECAY_MIN = 0.02`, `DECAY_MAX = 2`, `RATE_MIN = 0.25`, `RATE_MAX = 2`.
  - `readStepData(note): StepData` (defensive: missing, non-numeric, NaN or out-of-range → default or clamp; unknown keys such as `attack` ignored) and `clampStepData(data): StepData`.
- Produces (`loop-state.ts`): `setStepData(loop, channel, step, patch: Partial<StepData>): Loop` stores **only fields that differ from the defaults**, and removes `data` entirely when all are default. It rewrites `data` from the known fields only (an old `attack` key is dropped). It returns the same loop when nothing changes. `toggleStep` now writes no `data` (all defaults).
- Produces (`samples.ts`): `playSample(ctx, buffer, time, data: StepData, opts?: { duration?: number; output?: AudioNode }): void`. `output` defaults to `ctx.destination` (Task 3 supplies the master bus).
- `ChannelPlayer` passes `{ duration: e.duration }` (seconds, from `NoteEvent`).
- `DynamicsLanes`: the attack row becomes a decay row, minimal change only (Task 5 replaces this component): slider in ms `DECAY_MIN*1000..DECAY_MAX*1000`, step 10, aria `"<channel> step <n> decay"`, value `Math.round(decay * 1000)`.

Envelope (all times relative to `time`; `fade = min(0.01, duration/2)` when `duration` is given). Gain param events, in order:
- no `duration`, decay off (`decay >= DECAY_MAX`): `setValueAtTime(gain, time)`.
- no `duration`, decay on: `setValueAtTime(gain, time)`, `linearRampToValueAtTime(0, time + decay)`.
- `duration`, decay off: `setValueAtTime(0, time)`, ramp to `gain` at `time + fade`, `setValueAtTime(gain, time + duration)`, ramp to 0 at `time + duration + fade`.
- `duration`, decay on and `decay <= duration`: fade-in as above, then the decay ramp to 0 at `time + decay`; no end fade.
- `duration`, decay on and `decay > duration`: fade-in, then ramp to the decay line's level at `time + duration` (the line runs from `(time + fade, gain)` to `(time + decay, 0)`), then ramp to 0 at `time + duration + fade`.
- `source.playbackRate.value = rate`; with `duration`, also `source.stop(time + duration + fade)`.

- [ ] **Step 1: Write failing tests.** `test/audio-param.ts` exports `fakeGain()`: records `setValueAtTime`/`linearRampToValueAtTime` calls and exposes `levelAt(t: number): number` that evaluates the recorded piecewise-linear schedule. Tests:
  - `step-data.test.ts`: defaults; clamps (`gain` 5→1, `decay` 0→0.02, `rate` 9→2, `rate` 0→0.25); NaN/strings/arrays/`null` data fall back; an `attack` key is ignored.
  - `loop-state.test.ts`: `setStepData` stores only non-default fields (`{ gain: 0.8 }` for a gain edit; `{ gain: 0.8, rate: 0.55 }` after a rate edit); setting gain back to 1 removes `gain`; all-default removes `data`; same reference when unchanged or step off; a note's `duration` survives; `toggleStep`'s new note has no `data`; patches with `NaN` are ignored.
  - `samples.test.ts` (fake context, fake source with `playbackRate.value`, fake gain from the helper): `levelAt` assertions for each of the five envelope cases above — e.g. no duration + decay 0.5: `levelAt(time) = gain`, `levelAt(time + 0.25) = gain/2`, `levelAt(time + 0.5) = 0`; duration 0.1 + decay 2: level at `time + 0.1` is on the decay line and reaches 0 at `time + 0.1 + fade`; duration 0.3 + decay 0.1: no event after `time + 0.1`; duration 0.005: `fade` is 0.0025 and times are strictly increasing; `source.stop` called only when a duration is given; `playbackRate.value` equals `rate`; the buffer connects through the gain node to `opts.output` when given, otherwise to `ctx.destination`.
  - `DynamicsLanes.test.tsx`: rewrite the attack cases as decay cases (value shows ms; `onChange` sends seconds).

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement** per the interfaces. Compute the five envelope cases with explicit branches; do not use `cancelAndHoldAtTime`.
- [ ] **Step 4: Run all tests and typecheck.**
- [ ] **Step 5: Commit** — `feat(demo): gain/decay/rate step data and sustained-note envelope`.

---

### Task 3: Master compressor

**Files:**
- Modify: `src/audio.ts`, `src/use-audio-setup.ts`, `src/ChannelPlayer.tsx`
- Test: `test/audio.test.ts` (create)

**Interfaces:**
- Produces: `createMasterBus(ctx: Pick<AudioContext, "createDynamicsCompressor" | "destination">): AudioNode` — creates a compressor with the Global Constraints settings, connects it to `ctx.destination`, and returns it. `Audio` gains `output: AudioNode`.
- Consumes: `playSample(..., opts.output)` from Task 2.

- [ ] **Step 1: Write failing test** `audio.test.ts` with a fake context: the returned node's `threshold.value`, `knee.value`, `ratio.value`, `attack.value`, `release.value` equal −15, 30, 12, 0, 0.25, and it was connected to `ctx.destination` exactly once.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement** `createMasterBus`; `useAudioSetup` sets `output: createMasterBus(ctx)` in the `Audio` it builds; `ChannelPlayer` passes `output: audio.output`.
- [ ] **Step 4: Run all tests and typecheck.**
- [ ] **Step 5: Commit** — `feat(demo): master compressor`.

---

### Task 4: StepGrid shows every bar

**Files:**
- Modify: `src/StepGrid.tsx`, `src/styles.css`, `src/Machine.tsx` (pass nothing new; confirm the playhead step math covers all bars)
- Test: `test/StepGrid.test.tsx`

**Interfaces:**
- Consumes: `stepsPerBar`, `stepCount`, `isStepOn` (Task 1), `CHANNELS`.
- `StepGrid` props are unchanged. Behavior: one block per `loop.bars`, each `role="group"` with `aria-label="Bar n"`, each containing a row per channel of `stepsPerBar` buttons. Button aria-label `"<channel> step <n>"` with `n` global (1-based across bars); `aria-pressed` from `isStepOn`; `data-beat` where `step % 4 === 0` within the bar; `data-playhead` when the global step equals `playheadStep`; `onToggle(channel, globalStep)`.
- CSS: the grid sets `--steps` (the bar's `stepsPerBar`) via an inline style, and `.step-row, .lane` use `repeat(var(--steps, 16), …)`. Task 5 reuses the variable.

- [ ] **Step 1: Write failing tests**: a 2-bar loop renders two `Bar n` groups and 32 buttons per channel; `kick step 17` toggles global step 16 (first step of bar 2); the playhead on step 20 marks only that button; a note at a nudged `at` lights its nearest step; a 1-bar loop renders one group; a `beatsPerBar: 3` loop renders 12 buttons per row and `--steps` of 12; channels in the loop that the kit lacks are not rendered and a loop missing kit channels still renders empty rows.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all tests and typecheck.**
- [ ] **Step 5: Commit** — `feat(demo): step grid shows every bar`.

---

### Task 5: Parameter lanes — gain, decay, pitch, timing

**Files:**
- Create: `src/params.ts`, `src/StepLanes.tsx`, `test/params.test.ts`, `test/StepLanes.test.tsx`
- Delete: `src/DynamicsLanes.tsx`, `test/DynamicsLanes.test.tsx`
- Modify: `src/Machine.tsx`, `src/styles.css`

**Interfaces:**
- Produces (`params.ts`):
  - `interface StepParam { id: "gain" | "decay" | "pitch" | "timing"; label: string; min: number; max: number; step: number; defaultValue: number; get(loop, channel, step): number | null; set(loop, channel, step, value: number): Loop; format(value: number): string }`.
  - `STEP_PARAMS: readonly StepParam[]` in the order gain, decay, pitch, timing.
  - Units: gain 0–1 step 0.01, format `"80%"`; decay 20–2000 ms step 10, format `"500 ms"`, and `"off"` at 2000; pitch −24…12 st step 0.1, format `"−10.4 st"` (`12·log2(rate)`, written back as `2^(st/12)`); timing −11…11 ticks step 1, format `"2 ticks late"`, `"3 ticks early"`, `"on the grid"`. `set` goes through `setStepData` (gain, decay, rate) or `setNudge`.
- Produces (`StepLanes.tsx`): `StepLanes({ loop, channel, param, onChannelChange, onParamChange, onEdit })` where `param` is a `StepParam["id"]` and `onEdit(loop: Loop): void`. It renders a labelled `<select>` "Lane for" (channel) and a labelled `<select>` "Parameter", then one `.lane` row per bar of `stepsPerBar` vertical range inputs (`--steps` set as in Task 4). Each input: `aria-label "<channel> step <n> <label>"` (`n` global, 1-based), `aria-valuetext` from `format`, `disabled` when `get` is null (value then shows `defaultValue`), `onChange` → `onEdit(param.set(loop, channel, step, e.target.valueAsNumber))`.
- `Machine` owns `laneChannel` and `laneParam` state; the old `setStepData` wiring goes away.

- [ ] **Step 1: Write failing tests.**
  - `params.test.ts`: for each parameter, `get` is null on an off step; `set` then `get` round-trips (pitch: set 0 st → rate 1 → get 0; set −12 → rate 0.5; `get` of rate 0.55 is ≈ −10.35); `format` strings above; timing `set` moves `at`; out-of-range or NaN values clamp or are ignored without throwing; sparse data (set pitch on a note with `{ gain: 0.8 }` keeps gain).
  - `StepLanes.test.tsx`: 2-bar loop renders 2 rows × 16 sliders with names `kick step 1 gain` … `kick step 32 gain`; picking "timing" renames the sliders and shows ticks; a slider on an off step is disabled; changing a lit step's slider calls `onEdit` with the edited loop; `aria-valuetext` reads "2 ticks late" for a nudged note; the channel picker lists exactly the kit channels; a 1-bar loop renders one row.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement.** Vertical-slider CSS from the old `.lane input` rule stays; add a small gap between lane rows.
- [ ] **Step 4: Run all tests and typecheck.**
- [ ] **Step 5: Commit** — `feat(demo): parameter lanes for gain, decay, pitch and timing`.

---

### Task 6: The boom-bap kit, beat and default

**Files:**
- Create: `src/beats.ts`, `test/beats.test.ts`, `public/samples/CREDITS.md`
- Create (binary): `public/samples/{kick,snare,hihat,bass,plong1,plong2,string1,string2,string3}.wav`
- Delete: `public/samples/{sd,chh,clap}.wav`; `public/samples/kick.wav` is overwritten by his kick
- Modify: `src/samples.ts`, `src/loop-state.ts` (`CHANNELS`, remove `createInitialLoop`), `src/persistence.ts` (key), `src/App.tsx`, `src/Machine.tsx`, `src/Sharing.tsx`, `index.html`/title unchanged
- Modify tests: `test/loop-state.test.ts`, `test/samples.test.ts`, `test/persistence.test.ts`, `test/Sharing.test.tsx`

**Interfaces:**
- Produces: `createBoomBapLoop(): Loop` in `beats.ts`. `SAMPLE_URLS` has the nine channels. `CHANNELS` in `loop-state.ts` is `["kick", "snare", "hihat", "bass", "plong1", "plong2", "string1", "string2", "string3"]`. `STORAGE_KEY = "loops-demo:loop:v2"`. `Sharing` gains `onReset(): void` and a **Reset to boom-bap** button; `Machine` passes `() => onEdit(createBoomBapLoop())`. `App` falls back to `createBoomBapLoop()`.
- Samples come from `adamrenklint/dilla-boombap-demo` `sounds/*.wav` (MIT code; the sounds are the author's, "provided here for educational purposes"). Fetch each with `gh api -H "Accept: application/vnd.github.raw" repos/adamrenklint/dilla-boombap-demo/contents/sounds/<name>.wav > <dest>`; run `file` on one to confirm it is a RIFF WAVE and not an error body.
- The beat, from his `src/boombap.js` (positions `bar.beat.tick`, read with `pos(text, { beatsPerBar: 4 })`; durations in ticks; `data` keeps only his fields):
  - `kick`: `1.1.01`; `1.1.51` g0.8; `1.2.88`; `1.3.75`; `1.4.72` g0.8; `2.1.51` g0.7; `2.3.51` g0.8; `2.3.88`.
  - `snare`: `1.1.91`; `1.3.91`; `2.1.91`; `2.4.03`.
  - `hihat` (his `*` expanded to both bars): `1.1.01` g0.7; `1.2.01` g0.8; `1.3.01` g0.7; `1.4.01` g0.8; `1.4.53` g0.6; and the same five at `2.x`.
  - `plong1`: `1.1.01` d95. `plong2`: `1.4.90` d60 g0.4; `2.1.52` d60 g0.7.
  - `string1`: `1.3.75` d90 g0.6; `1.4.52` d90 g0.2; `2.3.25` d70 g0.6; `2.4.01` d85 g0.3; `2.4.75` **d22** g0.1 (his d85 does not fit the loop; the rest are unchanged).
  - `string2`: `2.2.50` d70 g0.6. `string3`: `1.2.05` d45 g0.6; `1.2.51` d45 g0.4; `1.3.05` d45 g0.2; `1.3.51` d45 g0.05; `2.2.05` d45 g0.6.
  - `bass` (gain 0.8 unless noted, always written explicitly as he does): `1.1.01` d60 r0.55; `1.2.72` d15 g0.5 r0.55; `1.3.02` d40 r0.55; `1.4.01` d40 g0.6 r0.64; `1.4.51` d100 r0.74; `2.3.51` d60 r0.46; `2.4.51` d40 r0.52.
- `CREDITS.md`: names the source repo and author, says the code is MIT, and quotes his words on the sounds: "These are lifted from my crates, provided here for educational purposes."
- App credit line under the `<h1>`: "Beat after Adam Renklint's dilla boom-bap demo", linking to `https://github.com/adamrenklint/dilla-boombap-demo`.

- [ ] **Step 1: Write failing tests.**
  - `beats.test.ts`: `parseLoop(createBoomBapLoop()).ok`; `bars` 2, `beatsPerBar` 4, `tempo` 88; channels exactly `CHANNELS`; per channel, the sorted `at` values equal an independently computed list (a local `tick(bar, beat, t) = ((bar−1)*4 + (beat−1))*96 + (t−1)` over his positions above — do not call `pos`); gains, rates and durations match the table, including `string1` last note `duration` 22 and `at + duration === 768`; no two notes in a channel share a step (`stepOf`); every note's `|nudgeOf(at)| <= 9`; a fresh call returns an equal but not identical object.
  - `samples.test.ts`: `SAMPLE_URLS` keys equal `CHANNELS`, every URL is under `/samples/` and ends `.wav`.
  - `persistence.test.ts`: the storage key is the v2 key; an old-key value is not loaded.
  - `Sharing.test.tsx`: **Reset to boom-bap** calls `onReset` once.
  - `loop-state.test.ts`: remove the `createInitialLoop` cases; keep the rest, which build their own loops.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Implement** the files above; download the samples; `git rm` the three old WAVs and overwrite `kick.wav`.
- [ ] **Step 4: Run all tests and typecheck.** Then run `pnpm --filter drum-machine build` to confirm the bundle builds.
- [ ] **Step 5: Commit** — `feat(demo): boom-bap beat, nine-sample kit and credits`.
- [ ] **Step 6: Manual check** (the author's, after review): open the demo; Play; it should sound like the original at 88 bpm; edit timing, pitch and decay while it plays; export includes `gain`, `decay`, `rate` and the nudged `at`; Reset restores the beat.
