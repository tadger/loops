# Drum machine: tailwind-topcoat reskin and gap register

Status: awaiting approval
Date: 2026-11-18
Size: small change (one example app, no library or theme changes)

## Intent and why

Polish the React drum machine (`examples/drum-machine`) by moving its UI onto
[`tadger/tailwind-topcoat`](https://github.com/tadger/tailwind-topcoat), the owner's Tailwind v4 port of a
web 2.0 theme. The owner has not decided where reusable UI should live, so the reskin doubles as a survey:
every control the theme has no primitive for is recorded, with a recommendation on whether the theme or the
app should own it. The owner decides what to do with that register afterwards.

## Goals

- The app renders with the theme in light and dark (the theme follows `prefers-color-scheme`).
- Every control the theme covers uses its `topcoat-*` class: Play/Pause/Stop/Mute/Export/Import/Reset as
  `topcoat-button` (Play as `--cta`), tempo as `topcoat-range`, the JSON boxes as `topcoat-textarea`, the
  Tree/Raw switch as `topcoat-button-bar`.
- Controls without a primitive get an app-local stopgap built only from `--tc-*` tokens, so they match the
  theme and can be lifted into it later.
- A gap register: per gap, the control, what is skin (CSS) vs behavior (JS), and a theme-or-app recommendation.

## Non-goals

- Any change to the tailwind-topcoat repo, or any new theme component.
- Layout redesign. Light touch only: reskin in place; add a panel or navigation-bar header only where a
  theme primitive naturally calls for it.
- The theme's mobile scale (`data-topcoat="mobile"`), whose 3rem controls would break the 16-step grid.
- Audio, core, react or web-audio package changes.

## Anti-goals

- Hard-coded colors left in app CSS (the `#2563eb`-style hexes), which break dark mode.
- Any DOM or accessibility regression: roles, `aria-pressed`, `aria-label`, focus behavior stay as tested.
- Pushing JS behavior into the theme (it is a CSS plugin).

## Constraints

- Theme is Tailwind CSS v4 (`~4.3.5`), private, exposes `index.css`; the app currently has no Tailwind.
- Both repos are private and owned by the same GitHub account, so the app depends on the theme as a git
  dependency (`tadger/tailwind-topcoat`, pinned by the lockfile). Installing needs access to that repo.
  Local iteration on the theme uses a temporary `link:` override that is not committed.
  (Changed 2026-11-18 from a path dependency, at the owner's prompting, before any code was written.)
- The step grid and parameter lanes share `--step-*` variables so their columns align; that must survive.

## Approaches

There is one sensible way: add `tailwindcss` and `@tailwindcss/vite` to the app, `@import` the theme in
`styles.css`, and put `topcoat-*` classes on existing markup. The alternatives don't fit: the theme is a
Tailwind plugin, so it can't be consumed without Tailwind; copying its CSS into the app would fork it and
defeat the point of the survey.

## Design

**Rule of thumb for the register.** Theme owns a control if nothing in it knows about loops and its behavior
is native HTML plus ARIA (the theme may own just the skin). If it needs real JS, the app owns the behavior;
the theme is involved only if the visuals are generic, pure-CSS skin. Each register row records skin,
behavior and owner separately.

**Seed list of likely gaps** (confirmed or dropped during the work): step pad (toggle tile with accent-beat
and playhead states), dial (skin vs drag/keyboard behavior), `select`, JSON tree (`<details>` could make it
native), panel/card, field label with error message, dial value bubble.

**Mechanics.** `styles.css` starts with `@import "tailwindcss"; @import "tailwind-topcoat";`, then only the
app-specific rules, rewritten to use theme tokens. Body gets `bg-topcoat-page font-topcoat text-topcoat-text`.
Desktop scale only; pads and dials size themselves with their own variables.

**Verification.** `pnpm test`, `pnpm typecheck`, `vite build`, then look at the running app in light and
dark.

**Deliverable.** The register is written to `docs/superpowers/specs/2026-11-18-topcoat-gap-register.md`
(my call) so it can be reviewed and decided on separately from the reskin.

## Left to the builder

Exact class composition per element, which stopgaps are built as CSS classes vs utilities, and whether the
app header becomes a `topcoat-navigation-bar`.
