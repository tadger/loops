# Loops — design

Status: **draft for approval** · Date: 2026-11-16 · Working name: `loops` (my call; rename freely)

A small, framework-agnostic library for scheduling looped note playback against the Web Audio clock, with a separate React adapter. It is a clean-room successor to [dilla](https://github.com/adamrenklint/dilla) (archived 2017), not a fork.

---

## 1. Intent and why

Dilla was effective: audio-clock lookahead scheduling, declarative per-channel `set(id, notes)`, and compact pattern addressing. But when it was used from a React UI the API got in the way. Reading its source (v1.8.4) shows the friction came mostly from missing basics, not from the scheduling idea:

- no `dispose()`, so the clock leaks (React StrictMode double-mounts effects);
- no subscribable state and no snapshot (the example polls `position()` in `requestAnimationFrame`);
- no `AudioContext.resume()` handling (it uses a 250 ms `setTimeout` hack instead);
- one global `step` event stream the consumer must demultiplex;
- positions as `"BAR.BEAT.TICK"` strings, parsed and formatted constantly;
- `set()` mutates the caller's array, and prototype-level memoization is shared across instances.

The goal here is a library whose pieces each have one job and are fully tested, whose **loops are plain serializable data the consumer owns**, and whose React adapter is thin because the core was designed for it.

**Success looks like:** a drum-machine demo (§10) where steps are toggled while the loop plays, with no dropped or doubled notes, and where the whole beat can be saved and reloaded as JSON.

## 2. Goals, non-goals, anti-goals

### Goals
1. **Serialization is the first design constraint.** A loop is JSON. `JSON.stringify(loop)` is a complete save; `parseLoop(JSON.parse(text))` is a complete, validated load, and round-trips exactly.
2. **Intuitive API.** Few concepts: a *loop* (data), a *transport* (plays a loop), a *channel handler* (makes sound for a channel).
3. **Real-time loop editing is a first-class case.** Replacing the loop while playing has defined, tested semantics (§7).
4. **Small, focused pieces.** Each core module has one job and a documented behavior list; each is test-driven.
5. **Deterministic core.** Everything except the thin Web Audio adapter is testable with a fake clock and fake timer, no `AudioContext`.
6. **Framework-agnostic core.** The React package is a thin binding over `subscribe`/`getSnapshot`.

### Non-goals (v1)
- Sound generation, instruments, effects, sample loading. The library schedules; the consumer plays.
- Swing / groove / humanize (the namesake feature — first post-v1 addition; §11 shows where it fits).
- Per-channel loop length (polymeter), one-shot patterns, pattern chaining / arrangement, quantized launch.
- Tempo ramps, a tempo override on the transport (tempo comes from the loop).
- Cancelling a note whose start has already been emitted (it plays out).
- MIDI I/O, AudioWorklet clock driver, Vue/Svelte adapters.
- Backward compatibility with dilla's API or its position-expression syntax (`*.even.01`). A string step-grid helper replaces most of its use.

### Anti-goals (a failure even if it technically works)
- A stateful god-object that wraps everything (dilla's shape).
- Any global mutable or shared state: module-level caches, shared emitted objects.
- Mutating anything the caller passed in.
- Touching `window`/`document` at import or construction time in `core`.
- Two serialized forms for the same loop, or a loop that can only be saved by custom code.
- A React adapter that needs to reach into core internals.

## 3. Constraints

- TypeScript (strict), ESM only, zero runtime dependencies in `core`. React adapter has `react >= 18` as a peer dependency (needs `useSyncExternalStore`).
- Runs in modern browsers. `core` must import and construct under Node (SSR, tests).
- Timing is measured in the Web Audio clock's seconds; the core never reads wall-clock time.
- Test-first. A behavior without a test doesn't exist.

## 4. Approaches considered

| | Approach | Verdict |
|---|---|---|
| **A** | Pure core of single-job modules; clock and timer injected; Web Audio and React as separate adapters | **Chosen** |
| B | One `Scheduler` class with constructor-injected deps (dilla's shape, cleaned up) | Rejected. Pieces can't be tested alone, and this shape made dilla awkward. *If ever needed, B can be built as a translation layer over A.* |
| C | Patterns as query functions `query(span) → events` (Strudel-style) | Rejected for v1. More expressive, but a bigger surface and a different mental model; a step grid doesn't need it. Could layer on top of A later. |

Chosen by the author: **A**, as a **pnpm monorepo**.

## 5. Decisions

### Made by the author
- Approach A; monorepo.
- Core is small and focused; each piece has one job.
- TDD for all core behavior; the React adapter is a separate small package.
- Demo is a simple drum machine with real-time loop editing.
- **Loops are plain JSON data the consumer owns; the library never holds or mutates them.**
- **A saved loop carries its tempo.**
- Intuitive API and clean de/serialization are the top priority.

### My calls (check these)
- Working name `loops`; packages `@loops/core`, `@loops/web-audio`, `@loops/react`; demo in `examples/drum-machine`.
- TypeScript + ESM, Vitest, fast-check for property tests, pnpm workspaces. Build tool and linter are the builder's choice.
- Time is **integer ticks**, 96 per beat (`PPQN = 96`, divisible by 2 and 3, so 16ths, 32nds and triplets are exact). It is a constant, not a loop field; changing it later means a `version` bump.
- Canonical stored form is ticks (numbers). Friendly authoring goes through helpers that *return ticks*; there is no second string form in stored data.
- **Start-only events**: there are no separate `stop` events. A stored note's `duration` is in **ticks**; the emitted event's `duration` is in **seconds**, converted once at emit time using the tempo in force at that moment. It is not retimed if the tempo changes mid-note.
- Notes must lie within the loop: `at + (duration ?? 0) <= length`, all in ticks. Wrap-around notes are a validation error in v1.
- Notes sharing the same `at` on a channel are allowed (layering).
- No tempo override on the transport in v1.
- Lookahead defaults to 100 ms with a 25 ms timer interval (configurable).

## 6. Data model

```jsonc
{
  "version": 1,
  "bars": 2,
  "beatsPerBar": 4,
  "tempo": 92,
  "channels": {
    "kick":  [ { "at": 0,   "duration": 24, "data": { "gain": 1 } },
               { "at": 192 } ],
    "snare": [ { "at": 96 }, { "at": 288 } ]
  }
}
```

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Note<D extends Json = Json> {
  at: number;          // integer ticks from loop start, 0 <= at < length
  duration?: number;   // integer ticks, > 0; omitted = one-shot
  data?: D;            // opaque to the library; passed to the handler untouched
}

interface Loop<D extends Json = Json> {
  version: 1;
  bars: number;        // integer >= 1
  beatsPerBar: number; // integer >= 1
  tempo: number;       // bpm, finite, > 0 (bounds: builder's call; suggest 20–400)
  channels: Record<string, Note<D>[]>;
}
// length in ticks = bars * beatsPerBar * PPQN
```

Rules:
- A loop is JSON-only: no functions, class instances, `Map`/`Set`, `undefined` values, `NaN`/`Infinity`. `data` is constrained to `Json`.
- **Canonical form**: notes within each channel sorted by `at` (stable for equal `at`), object keys in a fixed order. `serializeLoop(loop)` returns this canonical form; `parseLoop` normalizes to it. So `parseLoop(JSON.parse(JSON.stringify(serializeLoop(x))))` deep-equals `serializeLoop(x)`, and diffs between saves are stable.
- Channel ids are arbitrary non-empty strings.
- Unknown `version` → a diagnostic, never a guess. Future versions add migrations keyed on `version`.

## 7. Core pieces (`@loops/core`)

Each piece is one module with one job. All are pure except `transport`, which owns the only mutable state, and which gets time and timers by injection.

### 7.1 `position`
**Job:** convert between `"bar.beat.tick"` strings and tick counts, for authoring and display only.
- `pos("1.1.01", { beatsPerBar }) → 0`; `formatPos(tick, { beatsPerBar }) → "1.1.01"` (1-based bar/beat; tick part is 1-based, two-digit padded, like dilla).
- Strict parsing (anchored; rejects `"x1.2.3y"`, `"1.2.3.4"`, zero or out-of-range parts); parse errors are reported, not thrown silently into NaN.
- Round-trip for every tick in a loop.

### 7.2 `loop` (data, validation, edits)
**Job:** the loop type, validation, canonical serialization, and pure edit helpers.
- `parseLoop(input: unknown) → { ok: true, loop } | { ok: false, errors: Diagnostic[] }`. A `Diagnostic` has a JSON `path` (e.g. `channels.kick[3].at`) and a message. Collects **all** errors, doesn't stop at the first.
- `serializeLoop(loop) → Loop` (canonical, §6).
- Pure edits returning **new** loops, inputs never mutated (inputs may be frozen): `toggleNote(loop, channel, at, note?)`, `addNote`, `removeNotes(loop, channel, at)`, `setChannel`, `clearChannel`, `setTempo`, `resize(loop, { bars?, beatsPerBar? })`.
- `toggleNote` removes **all** notes at `(channel, at)` if any exist, otherwise adds one (my call).
- `resize` drops notes that no longer fit and reports which (my call: returns `{ loop, dropped }`).
- Authoring helper: `steps("x...x...x...x...", { stepTicks: 24 }) → Note[]` (`x` = note, `.`/`-` = rest; builder may add accent chars).
- Structural sharing: unchanged channels keep reference identity (cheap React updates).

### 7.3 `compile`
**Job:** turn a `Loop` into a `CompiledLoop`: per channel, notes sorted by `at`, with derived numbers (length in ticks).
- Pure; memoized per loop **object identity** via `WeakMap` (no `JSON.stringify` keys, no unbounded cache, no cross-instance sharing).
- Assumes a validated loop; does not re-validate.

### 7.4 `tempo`
**Job:** convert between ticks and clock seconds.
- An **anchor** `{ tick, time, bpm }`: `timeAt(tick)` and `tickAt(time)` are linear from the anchor. `reanchor(tick, bpm)` creates a new anchor at the given tick with the same instant, so a tempo change never shifts already-computed times.
- No ramps in v1. Immutable value type.
- Property: `tickAt(timeAt(t)) ≈ t`.

### 7.5 `window`
**Job:** given a compiled loop and a half-open tick range `[from, to)` on a monotonic absolute tick counter, return the note events that start in it, handling loop wrap.
- `queryWindow(compiled, originTick, from, to) → ScheduledNote[]` (channel, note, absolute tick), ordered by tick, then channel order, then note order.
- A range spanning one or more loop boundaries returns each loop's notes, in order.
- **Partition property** (property test): for any loop and any way of splitting `[a, b)` into consecutive sub-windows, concatenating the results equals the single query over `[a, b)`; no note is dropped or duplicated.
- Empty loop, empty channel, zero-width window all return `[]`.

### 7.6 `transport`
**Job:** run the lookahead loop and own playback state. Everything else it needs is injected.

```ts
interface Clock { now(): number }                       // seconds, monotonic
interface Timer { every(ms: number, fn: () => void): () => void }  // returns cancel

createTransport({ clock, timer, lookahead = 0.1, interval = 0.025, startDelay = 0.05 }): Transport

interface Transport {
  // state (subscribable; stable snapshot object, replaced only on change)
  subscribe(listener: () => void): () => void;
  getSnapshot(): { status: 'stopped' | 'playing' | 'paused'; loop: Loop | null };
  getPosition(at?: number): { tick: number } | null;  // loop-relative; NOT in snapshot. See "Position" below.

  // control
  setLoop(loop: Loop): void;
  start(): void;      // from stopped: tick 0. From paused: resumes in place. See "Starting" below.
  pause(): void;      // keeps position
  stop(): void;       // resets to tick 0 from ANY state (playing, paused, stopped)
  dispose(): void;    // idempotent; cancels timer, drops listeners and handlers

  // sound
  channel(id: string, handler: (e: NoteEvent) => void): () => void;  // returns unsubscribe
}

interface NoteEvent {
  channel: string;
  note: Note;          // the loop's own note object, by reference. Typed Readonly; the core never mutates it, handlers must not.
  time: number;        // clock seconds at which to start
  duration?: number;   // seconds, from note.duration at the tempo in force
  tick: number;        // loop-relative tick
  late: boolean;       // true if `time` was already in the past when emitted
}
```

Behavior:
- Each timer tick, the transport computes the window up to `clock.now() + lookahead`, queries it, and calls each channel's handler. Events for channels with no handler are dropped. A handler that throws doesn't stop other handlers or the loop (error surfaces via an `onError` option; builder's call on shape).
- **Positions.** The transport keeps a monotonic **absolute tick** counter and an `originTick`; loop-relative tick = `(absolute − originTick) mod length`. It also tracks `scheduledUpTo`, the absolute tick up to which notes have already been emitted (the committed region). Windows are `[scheduledUpTo, tickAt(now + lookahead))`, so consecutive windows partition the absolute tick line.
- **Live-edit semantics** (the core requirement). `setLoop` while playing takes effect at `scheduledUpTo`, the start of the next window. Notes already inside the committed region (up to one `lookahead`, ~100 ms) are never revised: an added note there is heard on the next pass, and a removed note there still plays. This bounded latency is accepted. Invariants, each a test:
  1. No absolute tick is queried twice, so **no note is emitted twice**. "Once per pass" means once per absolute occurrence.
  2. A note present before and after an edit, whose absolute tick is at or after `scheduledUpTo`, is emitted exactly once.
  3. A note removed before its window is reached is never emitted. A note whose start was already emitted is **not** cancelled.
  4. A note added at an absolute tick at or after `scheduledUpTo` is emitted at the correct time in the same pass. One added inside the committed region waits for the next pass.
  5. Event `time`s are non-decreasing across edits.
  6. Tempo change via `setLoop`: the tempo anchor is re-anchored at `scheduledUpTo`; already-emitted times don't move.
  7. Loop length change: at `scheduledUpTo`, let `r` be the current loop-relative tick under the old length. The new `originTick` is set so the relative tick there is `r mod newLength`. Absolute ticks stay monotonic. When the loop shrinks past the playhead, the relative position can jump backward, which is audible as a musical jump. Nothing is emitted twice at the same absolute tick.
  8. Combined tempo and length change in one `setLoop` applies both at the same `scheduledUpTo`, in the order above (anchor first, then origin).
- **Starting.** `start()` from stopped anchors tick 0 at `clock.now() + startDelay` (default 50 ms), so the first note is not `late`. From paused it resumes at the first uncommitted tick (`scheduledUpTo`) with the same delay: notes already emitted into the lookahead before the pause play out and are not emitted again. `start()` with no loop set is allowed: status becomes `playing` and nothing is emitted until a loop arrives, which takes effect at `scheduledUpTo`. `setLoop` while **stopped** or **paused** replaces the loop immediately, and playback uses it from the next `start()`.
- **Position.** `getPosition(at = clock.now())` returns the loop-relative tick for the *scheduled* timeline at that time. That is the audible position once output latency is subtracted, so callers pass `at` explicitly to align with `outputLatency`. It returns `null` only when no loop has been set. When stopped it returns tick 0, and when paused it returns the frozen first-uncommitted tick. Playing, it is derived from the tempo anchor, not stored.
- `stop()` works from every state (fixes a dilla bug where `stop()` after `pause()` did nothing).
- `late` events are still emitted (the handler decides); no silent dropping.
- `dispose()` twice is a no-op; calls after dispose are no-ops and never throw. Safe under StrictMode mount/unmount/mount.
- No `window`/`document` access; no module-level state; two transports never interfere.

## 8. Adapter: `@loops/web-audio`

**Job:** supply a real `Clock` and `Timer` for the browser, and nothing else.
- `createAudioClock(ctx: AudioContext) → Clock` (`ctx.currentTime`).
- `workerTimer() → Timer`: interval driven from a Worker so background-tab timer throttling doesn't stall scheduling; a `setInterval` fallback is acceptable if Workers are unavailable.
- `ensureRunning(ctx)`: `ctx.resume()` when suspended; the demo calls it from the first user gesture. (The transport never creates the context or resumes it itself.)
- Optional: expose `outputLatency` for playhead alignment.
- Tested in a browser-capable runner (builder's choice: Vitest browser mode or Playwright). Core logic is *not* tested here.

## 9. Adapter: `@loops/react`

**Job:** bind a transport to React. Thin; no scheduling logic.
- `TransportProvider({ transport | (clock, timer), loop? })`: calls `setLoop(loop)` when the `loop` prop changes. **The loop is a controlled prop**, and it is optional (it may arrive after mount). Ownership rule: if given `clock` and `timer`, the provider creates the transport and disposes it on unmount (StrictMode-safe); if given an external `transport`, the provider **never disposes it**, and a change of `transport` identity just rebinds.
- `useTransport() → Transport`.
- `useTransportState(selector)`: `useSyncExternalStore` over `subscribe`/`getSnapshot`, re-renders only when the selected value changes.
- `useChannel(id, handler)`: registers the handler, unregisters on unmount; uses a latest-ref so inline handlers don't reschedule or re-register.
- `usePlayhead(onFrame)`: `requestAnimationFrame` loop reading `getPosition()`; deliberately does **not** push position through React state.
- Tested with React Testing Library against a fake transport/clock.

## 10. Demo: `examples/drum-machine`

Vite + React. Purpose: prove the API and the live-edit story.
- 16-step grid × 4 channels (kick, snare, closed hat, clap). Sounds are the author's supplied WAV samples (`kick`, `sd`, `chh`, `clap` from `~/Downloads/samples`, 44.1 kHz mono 16-bit), loaded and played by the demo itself; sample loading stays out of the library. Redistribution rights for the samples must be confirmed by the author before the repo is published.
- Play / stop, tempo slider (edits `loop.tempo`, so exercises tempo re-anchoring).
- Clicking a step while playing toggles it via `toggleNote` → new loop → `setLoop`; the change is heard on the next pass with no glitches.
- Playhead highlight via `usePlayhead`.
- **Save / load**: export the loop as JSON text, import from a textarea (with `parseLoop` diagnostics shown on failure), and persist to `localStorage`.
- Doubles as the manual acceptance test for the success criterion in §1.

## 11. Future-proofing (not v1)

- **Swing/groove**: add an optional per-loop `swing` (and/or per-note `offset` ticks) in `version: 2` with a migration; `window` stays in ticks and a small stage maps tick → tick before the tempo map. Nothing in v1 should preclude this.
- **Per-channel length / polymeter**: `window` already takes a loop length per query; extend the compiled form.
- **Strudel-style layer (approach C)** or a **B-shaped facade**: build on `compile` + `window` + `transport`.

## 12. Testing strategy

Strictly test-first: write the failing test for a behavior, then the code.

- **Per-piece behavior lists** are the bullets under each §7 piece; each bullet maps to at least one test.
- **Property tests (fast-check)**: `window` partition property; `position` round-trip; `tempo` tick↔time round-trip; `loop` canonical round-trip (`parse ∘ serialize` identity); edits never mutate inputs.
- **Transport**: driven entirely by a `FakeClock` and `FakeTimer` that advance time by hand. Each live-edit invariant (§7.6) is a test; also start/pause/stop from every state, dispose idempotence, two-instance isolation, throwing handler, late events.
- **Regression tests from dilla's defects** (each must fail on a naive port): input array not mutated (including frozen input); `stop()` after `pause()` resets; changing `beatsPerBar` never serves stale positions; two instances with different handlers never see each other's results; position strings are strictly validated; `tempo`/`beatsPerBar` of 0 are rejected.
- **web-audio adapter** and **react adapter** have their own small suites as described above. Optionally one offline-render test that schedules a loop on an `OfflineAudioContext` and checks onset times, if it can be made reliable.
- Coverage is a signal, not a target; the behavior lists are the spec.

## 13. Repository layout

```
loops/
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  packages/
    core/        src/{position,loop,compile,tempo,window,transport}.ts  test/
    web-audio/   src/  test/
    react/       src/  test/
  examples/
    drum-machine/
  docs/superpowers/specs/2026-11-16-loops-design.md
```

## 14. Left to the builder

Build tool and bundling, linter/formatter, exact tempo bounds, `Diagnostic` shape beyond `path` + `message`, `onError` option shape, `steps()` accent syntax, exact `late` threshold, README/API docs, CI, npm publishing and versioning, the browser test runner choice, and how the React provider obtains its `AudioContext` (the demo may simply create one in a click handler).
