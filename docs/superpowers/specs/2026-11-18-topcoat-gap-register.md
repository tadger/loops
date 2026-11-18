# Drum machine: tailwind-topcoat gap register

Date: 2026-11-18
Context: the reskin in `docs/superpowers/plans/2026-11-18-demo-topcoat.md`. Rule of thumb (from the design): the
theme owns a control if nothing in it knows about loops and its behavior is native HTML plus ARIA (it may own
just the skin); real JS behavior stays in the app, and the theme is involved only if the visuals are generic,
pure-CSS skin. Items 1 to 5 here are the ones sent to the theme session in
`2026-11-18-topcoat-primitive-requests.md`. Every stopgap in the app carries a `stopgap:` comment.

## Covered by the theme today (no gap)

| App element | Theme primitive |
|---|---|
| Play, Pause, Stop, Mute all, Export, Reset, Import | `topcoat-button`, `topcoat-button--cta` |
| Tempo slider | `topcoat-range` |
| Import and raw-export boxes | `topcoat-textarea` |
| Page header | `topcoat-navigation-bar` |
| Tree/Raw switch (structure and look) | `topcoat-button-bar` (selected state is gap 1) |

## Gaps

| # | Control | Where used | What the theme gives / the stopgap | Skin (CSS) | Behavior (JS) | Recommended owner |
|---|---|---|---|---|---|---|
| 1 | Pressed state for `<button aria-pressed>` | Tree/Raw switch (`Sharing`) | Theme styles selection only for radio-driven bars. Stopgap: `.topcoat-button-bar button[aria-pressed="true"]` using `--tc-surface-active` and `--tc-shadow-inset-active`. | All of it | None (native attribute) | **Theme.** Fits the rule exactly, and any toggle button needs it. |
| 2 | `select` | Lane and parameter pickers (`StepLanes`) | No select primitive. Stopgap: `topcoat-text-input` on a native `<select>`; it renders correctly in both schemes with the native arrow, but the arrow can't follow theme colors. | All of it | None | **Theme.** Native element, pure skin. |
| 3 | Field with label and message | Import box label, import error list | `[role="alert"]` colored with `--tc-invalid`; the label is unstyled text. | Layout, label, message, invalid state | None | **Theme.** Generic and CSS-only. |
| 4 | Highlight color | Playhead ring on the step pads | No neutral-warm token. Stopgap: app token `--pad-playhead` (amber, with a dark value). | A token | None | **Theme.** A token, cheapest to add. |
| 5 | Tooltip / value bubble | Dial value while hovering, dragging or focused | Stopgap: `.dial-value` skinned from `--tc-surface`, `--tc-text`, `--tc-border`, `--tc-radius`. | All of it (the consumer positions it) | Show and hide is app state | **Theme (skin only).** The bubble overlaps the picker row above bar 1; that placement is the app's, and predates this work. |
| 6 | Step pad (toggle tile) | The 9 × 16 step grid, 2 bars | App-local `.step`: raised fill, accent fill when pressed, stronger border on beats, playhead ring, focus ring. From `--tc-*`, plus the app's `--pad-playhead` for the ring. | Tile, pressed, "emphasized", focus | None (native `aria-pressed`, `data-beat`, `data-playhead`) | **App, for now.** It is generic enough to be a primitive, but there's one consumer. Revisit if a second grid UI appears. |
| 7 | Dial | One per step in the parameter lanes | App-local `.dial*` rules plus an SVG. Colors from tokens. | Face, pointer, ticks, disabled, focus | Pointer-drag angle math, keyboard, inline edit, hidden range input | **App owns the behavior.** A CSS-only `topcoat-dial` skin driven by variables is possible (angle for value, min, max, default), but the geometry follows data, so I'd defer rather than design it blind. |
| 8 | JSON tree view | Export view | App-local `.json-*` rules. | Indentation guides, toggles, value colors | Expand and collapse state | **App.** Domain-adjacent and stateful. If wanted generically, `<details>`/`<summary>` could make it native. |
| 9 | Mute label (text toggle) | Channel names in the grid | `all: unset` button with line-through when muted. | Text button, pressed look | None | **Covered once 1 lands, if 1 also covers `--quiet`:** `topcoat-button--quiet` plus the pressed state could replace it, but the theme's quiet buttons have no pressed styling, so request 1 as worded may not reach them. |
| 10 | Readable muted text | JSON keys, dial ticks | `--tc-text-muted` is `#c6c8c8` in light, too faint on white. Stopgap: app token `--soft-text`, a `color-mix` of `--tc-text`. | A token | None | **Theme question for the owner:** is muted meant to be decorative only? If readable muted text is wanted, add a second token. Not yet sent to the theme session. |

## Status after the theme landed requests 1 to 5

Theme commit `bf0743d` ("loops primitives 1-5") delivered gaps 1 to 5, and the app now uses them: `aria-pressed`
styling on toggle buttons and button-bar segments, `topcoat-select`, `topcoat-field` with `__label` and
`__message--invalid`, `--tc-highlight` (the playhead ring), and `topcoat-tooltip` (the dial value). The matching
app stopgaps were deleted, and a test pins that none are left. The theme also added `--tc-invalid-text`, which
resolves the invalid-message contrast finding below. Still open and app-side: gaps 6 to 10, including
`--soft-text` (gap 10).

## Findings from the review pass

Found by the whole-branch review and fixed in the app; each also bears on a theme request.

- **Pale focus ring alone is faint on the light page** (`--tc-focus-ring` is about 1.7:1 on `--tc-page-bg`). The theme's own controls pair it with `--tc-focus-border`; the app's focus states now do the same. `--tc-focus-border` alone fails in dark, so the pair is the right token set for any new theme primitive.
- **A selected, focused button-bar segment lost its focus glow**: the app's pressed stopgap set `box-shadow` in a later layer than the theme's `:focus` rule. The stopgap now restates the glow. Request 1's pressed rule must keep the focus glow when pressed and focused.
- **`--tc-invalid` is too faint as text** (2.75:1 in light, 2.4:1 in dark). The app now keeps message text in `--tc-text` and marks it with a `--tc-invalid` left border. Request 3's "invalid message readable in both schemes" needs the same treatment.
- **A two-segment button bar has no divider** (the theme removes both adjoining borders), and selected and unselected fills differ by only about 1.2:1 in light. Worth checking in request 1.
- **The "stopgap:" marker covers the message, not the label.** The label above the import box is plain text with no stopgap to find; a theme field wrapper would add the wrapper, not replace app CSS.

Not a gap: a panel or card. The header, buttons and fields were enough for a light-touch reskin, so there is no
pressure from this app. Defer.

## Decisions needed

1. Gap 10: add a readable-muted text token to the theme, or keep it app-side? (Not in the request doc yet.)
2. Gap 6: promote the step pad to a theme primitive, or keep it app-owned until a second consumer exists?
3. Gap 7: design a CSS-only dial skin now, or leave the whole dial in the app?
4. Gap 2: accept the native arrow on selects until the theme ships `topcoat-select`?

## Observations from the browser pass

- Pad and dial columns line up exactly (centers equal at steps 1 and 16, in light and dark).
- No console errors in either scheme. Keyboard focus showed a single ring on a theme button and on a pad; the review then found the selected button-bar segment had lost its glow (fixed; see the review findings).
- The playhead was checked by setting `data-playhead` by hand, not by playing audio. Real playback was not exercised.
