# Primitive requests for tailwind-topcoat, from the loops drum machine

Status: **ready to implement: requests 1 to 5.** Drawn up from reading the app's markup, before the reskin is
built; the app's final gap register may add to this later, but nothing here is expected to be withdrawn. The
"Undecided" section is **not** a request; don't build those.
Date: 2026-11-18

## Priority and hand-off

Order: **1, 2, 3** first (the app uses all three immediately), then **4, 5**.

The app will adopt exactly the class names, attributes and token names written below. If the theme session
changes any of them, tell the loops session before finishing so the migration matches. When done, report
the commit on `main` that contains the work (the app pins theme commits through its lockfile) and mention
anything that deviates from this doc.

Each item should land with the theme's usual tests (a component test in `test/components.test.js` and, for
visual or interactive behavior, a browser test) and a section in `demo/index.html` showing it in light, dark,
desktop and mobile.

## Context for the theme session

`examples/drum-machine` in `tadger/loops` (a React app) is being restyled with this theme. It uses desktop
scale only, light and dark via `prefers-color-scheme`, and consumes the theme by `@import "tailwind-topcoat"`.
Everything below follows the theme's own conventions: `topcoat-*` class names with `--large` modifiers where
size matters, values read only from `--tc-*` tokens, rules written once for both color schemes, overridable
by utilities. The app's DOM must stay semantic (native elements plus ARIA), so each request is a **skin on
native markup**; no JavaScript is requested from the theme.

Until these exist, the app carries app-local stopgaps built from `--tc-*` tokens, so each request is also a
description of a stopgap to delete.

## Requested (theme should own)

### 1. Pressed state for toggle buttons

- **Need:** a button whose pressed state is `aria-pressed="true"` looks selected. Applies to `topcoat-button`
  and, inside a button bar, to `topcoat-button-bar__button`. Today the theme styles selection only for
  radio-driven bars and tab bars; `<button aria-pressed>` has no selected look.
- **Markup:** `<div class="topcoat-button-bar"><div class="topcoat-button-bar__item"><button class="topcoat-button-bar__button" aria-pressed="true">Tree</button></div>…</div>`
- **Look:** the existing `pressed` fragment (`--tc-surface-active`, `--tc-shadow-inset-active`), so it matches the
  radio-driven selected state. Hover and focus must still read distinctly from selected.
- **Accept:** works in light and dark; a pressed segment is distinguishable from a hovered one; `[aria-pressed="false"]` and absent attribute look unchanged; covered by a component test and a browser test.

### 2. `topcoat-select`

- **Need:** a native `<select>` skinned like `topcoat-text-input`, with a chevron.
- **Markup:** `<select class="topcoat-select">`, plus `topcoat-select--large`.
- **Look:** height, padding, border, radius, inset shadow, focus glow and disabled from the same tokens as the text input. Chevron must follow `--tc-text-muted` in light and dark, which a data-URI image can't do through a variable, so use a mask or a CSS-drawn arrow. Right-to-left safe.
- **Accept:** a labeled select next to a text input has the same height and border in both schemes; disabled and focus states match the input; keyboard and native picker behavior untouched.
- **Interim:** the app puts `topcoat-text-input` on `<select>` and keeps the native arrow.

### 3. Field with label and message

- **Need:** a label above or beside a control, with an optional help or error message.
- **Markup:** `<div class="topcoat-field"><label class="topcoat-field__label" for="x">…</label><input id="x" class="topcoat-text-input" aria-describedby="x-msg"><p id="x-msg" class="topcoat-field__message topcoat-field__message--invalid">…</p></div>`
- **Look:** label in `--tc-text` at the scale's font size; message smaller; `--invalid` uses `--tc-invalid`. The wrapper doesn't restyle the control. `[role="alert"]` messages should render the same as `--invalid`.
- **Accept:** spacing identical in desktop and mobile scale; invalid message readable in both schemes.

### 4. A highlight color token

- **Need:** `--tc-highlight` (and `bg-topcoat-highlight`/`ring-topcoat-highlight` via `@theme inline`) for "this is the thing happening now", such as a sequencer playhead. The theme has accent (CTA blue), focus blue and invalid red, but nothing neutral-warm.
- **Look:** an amber that reads against `--tc-surface` and `--tc-page-bg` in both schemes, and is clearly not the focus ring.
- **Accept:** contrast of the ring/fill against both page backgrounds is checked in light and dark.
- **Interim:** the app defines its own `--pad-playhead`.

### 5. `topcoat-tooltip` (value bubble)

- **Need:** a small floating label, for example the value shown while dragging a dial.
- **Markup:** `<span class="topcoat-tooltip" role="tooltip">0.8</span>`
- **Look:** skin only (surface, border, radius, small text, no wrap, `pointer-events: none`). The consumer positions it; the theme does not.
- **Accept:** readable in both schemes; no layout of its own beyond that.

## Follow-up notes from the loops review (apply if cheap)

- **Request 1:** a pressed and focused segment must still show the focus glow, and a two-segment bar needs a selected state clearly distinct from unselected (about 1.2:1 in light today, with no divider). Consider `topcoat-button--quiet` too, which has no pressed styling.
- **Request 3:** `--tc-invalid` as text is about 2.75:1 on the light page and 2.4:1 on the dark one. Keep message text in `--tc-text` and carry the invalid signal with a marker or border, or add a readable invalid-text token.
- **Any new focusable primitive:** `--tc-focus-ring` alone is about 1.7:1 on the light page; pair it with `--tc-focus-border` as the existing controls do.

## Undecided (the owner will say; the app owns these meanwhile)

- **Panel/card:** a raised or sunken container with optional header. `topcoat-list` and `topcoat-navigation-bar` cover some uses; unclear whether a general container earns its place.
- **Toggle tile:** a square toggle (`aria-pressed`) for grid UIs such as the step pad, with an "emphasized" variant. Generic enough to be a primitive, but only one consumer so far.
- **Dial skin:** a `topcoat-dial` whose face, pointer and ticks are drawn by CSS from a `--tc-dial-value` variable set by the app. Behavior (pointer-drag angle math, keyboard, inline edit) stays in the app regardless.

## Not requested

- **JSON tree view:** the app owns it; it's domain-adjacent and needs expand/collapse state.
- **Syntax colors** (string, number, boolean): the app keeps its own tokens.
