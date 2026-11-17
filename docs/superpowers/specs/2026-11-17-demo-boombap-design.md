# Demo: the boom-bap beat — design

Status: **draft for approval** · Date: 2026-11-17 · Extends §10 of `2026-11-16-loops-design.md` and supersedes the attack lane in `2026-11-16-demo-step-dynamics-design.md` · Demo only (`examples/drum-machine`); no library changes.

## Intent

Make the demo say something. It opens on a real beat, Adam Renklint's boom-bap loop from [dilla-boombap-demo](https://github.com/adamrenklint/dilla-boombap-demo) (March 2015, MIT code), and lets you reshape its feel while it plays. The beat shows the library's thesis: a groove is plain JSON, and "lazy kicks and eager snares" are just notes at off-grid ticks.

## Decisions

Made by the author:
- Replace the **attack** lane with **decay**.
- The boom-bap beat is the default; it should also be loadable as JSON.
- Use all nine of his channels: `kick`, `snare`, `hihat`, `plong1`, `plong2`, `string1`, `string2`, `string3`, `bass`.
- Commit his nine WAVs into the repo.
- Samples stay one-shots (sampled wave files), plus the sustained notes his beat already uses.

My calls (check these):
- **One kit.** The nine channels above are the demo's kit. His nine WAVs replace our four (`kick`, `sd`, `chh`, `clap`), which stay in git history. A second beat with its own kit is possible later (`Beat = loop + kit`), but not now.
- **Beat source.** `beats.ts` builds the loop with `pos("1.1.51", meter)` so his positions stay readable in the source. Export still produces the JSON. A **Reset to boom-bap** button next to Export/Import returns to it, because persistence would otherwise hide the new default behind a saved loop.
- **Storage key bumps** (`loops-demo:loop` to `loops-demo:loop:v2`) so an old saved 4-channel loop doesn't load against a kit it doesn't match.
- **Tempo 88, 2 bars, 4 beats per bar**, as his beat.
- **Per-step parameters** (the lane picker): `gain` (0–1, default 1), `decay` (seconds), `rate` (playback rate, i.e. pitch), `timing` (nudge). Defaults apply when a field is absent, so his data stays verbatim (`{ gain: 0.8 }`, `{ gain: 0.8, rate: 0.55 }`).
- **Decay** is `0.02–2` s, default `2` s, which is at least as long as every sample and so means "off". The level falls linearly from `gain` to 0 over `decay` seconds from the note's start.
- **Pitch** is stored as `rate` (his name), `0.25–2`, default 1, and shown in **semitones** (`12·log2(rate)`, step 0.1), so the lane reads musically and his non-integer rates (0.55 ≈ −10.4 st) round-trip.
- **Timing** is the signed tick distance from the nearest 16th-note step, `−11…+11`. (±12 would sit exactly between two steps and read back as the neighbouring step.) A step is `round(at / 24) mod stepCount`, and its nudge is the remainder. Notes keep their absolute `at`, so the JSON shows exactly when each note plays. At 88 bpm one tick is 7.1 ms, so his kicks (+2) are ≈14 ms late and his snares (−6) ≈43 ms early.
- **Wrap and fit.** A nudge that would put `at` below 0 wraps modulo the loop length, so an eager step-0 note plays at the end of the loop. (A late nudge on the last step reaches at most 11 ticks past it, still inside the loop.) A note whose `at + duration` would then exceed the loop length has its `duration` trimmed to fit, because `parseLoop` requires it to fit.
- **Sustained notes** (`duration` present, as on the plongs, strings and bass): fade in over 10 ms, and fade out over 10 ms ending at `duration`, as his `onStart`/`onStop` do. If the decay is shorter than the duration the level has already reached 0 and no end fade is scheduled; if the duration ends first, the fade starts from the decay level at that moment (computed, not read from the param). The fades are 10 ms, or half the duration if that is shorter, and are click guards, not controls.
- **Master bus:** one `DynamicsCompressor` with his settings (threshold −15, knee 30, ratio 12, attack 0, release 0.25) between the channels and `ctx.destination`. No reverb: it would need an impulse response.
- **Layout:** each bar is a block of 16 steps for every channel (two stacked blocks for the default beat). Rows come from the kit, not from the loop, as today. The lane picker gets a second dropdown for the parameter and shows one 16-slider row per bar. Aria names stay `"<channel> step <n> <parameter>"`, with `n` counting through both bars (1–32), and each slider gets an `aria-valuetext` such as "−10.4 st" or "2 ticks late".
- **Toggle:** turning a step on writes `at = step·24`, `data` omitted (all defaults); turning it off removes whichever note maps to that step.
- **Credit:** a line under the title ("Beat after Adam Renklint's dilla boom-bap demo") and `public/samples/CREDITS.md` quoting his own words about the sounds ("lifted from my crates, provided here for educational purposes").

## Findings the author should know

- **One of his notes doesn't fit our loop.** `string1` at `2.4.75` with `duration: 85` ends at tick 831, but the loop is 768 ticks long, and our `parseLoop` rejects notes that cross the loop end. The beat trims it to 22 ticks. It's his quietest note (`gain: 0.1`), so the change is hard to hear. A library rule change (let sustained notes wrap) is not proposed.
- Everything else from his repo loads unchanged: every position parses, and all his notes are within ±9 ticks of a 16th-note step.
- **Imported old loops** with an `attack` key still load. Editing a step drops that key, because `data` is rewritten from the known fields.

## Non-goals

Any `@loops/*` change; swing; probability; ratchet; pan; reverb; a length or duration lane (durations come from the beat or from imported JSON); multiple kits; a beat picker; undo.

## Verification

Test-first for all logic and components (jsdom). Subagents can't listen, so the audible checks are the author's:
- The default beat should sound like his demo at 88 bpm, in feel and balance.
- Dragging a timing slider while playing moves a hit within the next pass, without doubled or dropped hits.
- A pitched bass step sounds lower at a lower rate.
- Decay shortens a note, and the plongs and strings end without clicks.
- Export includes `gain`, `decay`, `rate` and the nudged `at`; a reload restores them.
- The step-0 eager nudge wraps to the loop end.
