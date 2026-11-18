# Drum machine: tailwind-topcoat reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `examples/drum-machine` with `tailwind-topcoat`, and record every control the theme has no primitive for in a gap register.

**Architecture:** Add Tailwind v4 and the theme (git dependency, locked to a commit by `pnpm-lock.yaml`) to the example app. Put `topcoat-*` classes on markup the theme covers. Controls without a primitive keep app-local classes, rewritten to read only `--tc-*` tokens (plus a few named app tokens where the theme has no equivalent). DOM semantics, roles and labels do not change.

**Tech Stack:** React 19, Vite 8, Tailwind CSS `~4.3.5`, `@tailwindcss/vite`, `tailwind-topcoat` (git dependency on the private repo `tadger/tailwind-topcoat`), Vitest + Testing Library (jsdom), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-11-18-demo-topcoat-design.md`

## Global Constraints

- No changes to the `tailwind-topcoat` repo and no new theme components.
- Desktop scale only: never set `data-topcoat="mobile"`.
- No hard-coded colors in `styles.css` except the named app tokens `--pad-playhead`, `--json-string`, `--json-number`, `--json-boolean` (the theme has no equivalent for them).
- Roles, `aria-pressed`, `aria-label`, `aria-expanded` and focus behavior stay exactly as the existing tests assert; class names `dial`, `dial-value`, `dial-edit` and the `data-tick` attributes stay (tests query them).
- The step grid and the parameter lanes keep sharing `--step-label-width`, `--step-min` and `--step-gap` so their columns align.
- App rules go in `@layer components` (not unlayered), so they never override the theme's base-layer rules, such as its focus glow.
- Light and dark must both work; the theme follows `prefers-color-scheme`.
- Every app-local stopgap for a requested theme primitive carries a CSS comment `/* stopgap: topcoat-<name> */` (names from `specs/2026-11-18-topcoat-primitive-requests.md`), so Task 6 can find and delete them.

## Review Focus

- Unlayered app CSS overriding the theme (a double focus ring on theme buttons): `styles.css` has no unlayered rules except `@import`s; the visual check in Task 5 looks at focus on a button and on a pad.
- Hex colors sneaking back into `styles.css` and breaking dark mode: pinned by `test/styles.test.ts` (created in Task 1, hex check added in Task 4).
- Step columns drifting from lane columns after the reskin (borders now `border-box` from Tailwind's preflight): Task 5 measures pad and dial x-positions in the browser.
- Muted rows and the playhead ring losing contrast in dark: Task 5 checks both in dark.
- Install from a clean state: the theme comes from a private GitHub repo, so Task 1 proves `pnpm install` works in a scratch clone, and the README says that access to `tadger/tailwind-topcoat` is needed.

---

### Task 1: Wire in Tailwind and the theme, with the page shell

**Files:**
- Modify: `examples/drum-machine/package.json`, `pnpm-lock.yaml`
- Modify: `examples/drum-machine/vite.config.ts`
- Modify: `examples/drum-machine/src/styles.css` (head of the file and the `:root`/`main`/global rules only)
- Modify: `examples/drum-machine/src/App.tsx` (header markup), `examples/drum-machine/index.html` (body classes)
- Modify: `README.md` (one sentence near the `pnpm install` instructions)
- Test: `examples/drum-machine/test/styles.test.ts` (create)

**Interfaces:**
- Produces: `styles.css` begins with `@import "tailwindcss"; @import "tailwind-topcoat";` and then the app rules inside `@layer components { ... }`. Later tasks edit rules inside that layer. Defines the app tokens `--pad-playhead`, `--json-string`, `--json-number`, `--json-boolean` on `:root` (each with a dark value via `@variant dark`), which Tasks 3 and 4 consume.

- [ ] **Step 0: Create a branch if on a detached HEAD**

Run: `git switch -c demo-topcoat` (skip if `git branch --show-current` already prints a branch).

- [ ] **Step 1: Write the failing test `test/styles.test.ts`**

Reads `src/styles.css` and asserts, test name `"imports tailwind and the theme"`: the file's first two non-comment lines are `@import "tailwindcss";` and `@import "tailwind-topcoat";`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run examples/drum-machine/test/styles.test.ts`
Expected: FAIL (no imports yet).

- [ ] **Step 3: Add the dependencies**

In `examples/drum-machine/package.json`, add dev dependencies `tailwindcss` `~4.3.5`, `@tailwindcss/vite` `~4.3.5`, and `tailwind-topcoat` `git+ssh://git@github.com/tadger/tailwind-topcoat.git#main` (the lockfile pins the commit; if pnpm can't fetch the private repo over this form, try `github:tadger/tailwind-topcoat` and report which worked). Run `pnpm install` from the repo root, then confirm `examples/drum-machine/node_modules/tailwind-topcoat/index.css` exists. If pnpm warns that `@tailwindcss/vite` doesn't list Vite 8 as a peer, stop and report it rather than forcing it.

- [ ] **Step 4: Register the Vite plugin**

In `vite.config.ts`: `plugins: [react(), tailwindcss()]` (import from `@tailwindcss/vite`). Keep the existing comment.

- [ ] **Step 5: Rewrite the head of `styles.css`**

Two imports first. Then `:root` (keeping `color-scheme: light dark` and the three `--step-*` variables, dropping `font-family`) with the four app tokens and their dark values (light: amber `#f59e0b`, green `#15803d`, blue `#1d4ed8`, amber `#b45309`; dark: lighter equivalents of your choice that read on `--tc-surface`). Wrap all remaining rules in `@layer components { }`. Delete the global `button, textarea, input { font: inherit }` rule (preflight does it) and the global `:focus-visible` rule (the theme owns focus on its controls; each stopgap class gets its own `:focus-visible` rule in Tasks 3 and 4, using `var(--tc-focus-ring)`).

- [ ] **Step 6: Page shell**

In `index.html`: `<body class="bg-topcoat-page font-topcoat text-topcoat-text">`. In `App.tsx`: replace the bare `<h1>` with `<header className="topcoat-navigation-bar mb-4"><div className="topcoat-navigation-bar__item w-full text-center"><h1 className="topcoat-navigation-bar__title">loops drum machine</h1></div></header>` (markup as in the theme demo). `main` keeps its width and padding rules.

- [ ] **Step 7: Verify**

Run: `pnpm vitest run examples/drum-machine && pnpm --filter drum-machine typecheck && pnpm --filter drum-machine build`
Expected: all tests and the build pass. Then confirm the built CSS contains the theme: `grep -c "topcoat-button" examples/drum-machine/dist/assets/*.css` prints a number greater than 0.

- [ ] **Step 8: README note**

After the `pnpm install` instructions add two sentences: the example installs the private theme from `tadger/tailwind-topcoat` on GitHub, so while both repos are private, installing needs GitHub HTTPS credentials with access to that repo (this goes away when they become public); and to iterate on the theme locally, temporarily run `pnpm --filter drum-machine add link:../../../tailwind-topcoat` (don't commit that change), then `git restore examples/drum-machine/package.json pnpm-lock.yaml` and `pnpm install` to go back to the git version. (Ruling after review: the dependency is declared as `git+https://…`, matching what pnpm records in the lockfile.)

- [ ] **Step 9: Commit**

```bash
git add examples/drum-machine pnpm-lock.yaml README.md
git commit -m "feat(demo): add tailwind and the topcoat theme to the drum machine"
```

- [ ] **Step 10: Check a clean install**

Run: `git clone . "$TMPDIR/loops-clean" && cd "$TMPDIR/loops-clean" && git checkout demo-topcoat && pnpm install --frozen-lockfile`.
Expected: install succeeds and `examples/drum-machine/node_modules/tailwind-topcoat/index.css` exists in the clone.

---

### Task 2: Reskin the covered controls

**Files:**
- Modify: `examples/drum-machine/src/Controls.tsx`, `src/StepGrid.tsx` (toolbar button only), `src/Sharing.tsx`
- Modify: `examples/drum-machine/src/styles.css` (`.controls`, `.grid-toolbar`, `.sharing`, `.export-toggle`, `[role="alert"]` rules)
- Test: `test/Controls.test.tsx`, `test/Sharing.test.tsx`, `test/StepGrid.test.tsx`

**Interfaces:**
- Consumes: the Task 1 layer structure.
- Produces: the stopgap rule `.topcoat-button-bar button[aria-pressed="true"]` (selected segment for the Tree/Raw switch, since the theme styles only radio-driven selection) in `styles.css`, using the theme's `--tc-surface-active` and `--tc-shadow-inset-active`. Task 5 lists it in the gap register.

- [ ] **Step 1: Write the failing tests**

  - `Controls.test.tsx`, `"styles the transport with the theme"`: the Play button has class `topcoat-button--cta`; Pause and Stop have `topcoat-button`; the tempo slider (`getByRole("slider")`) has `topcoat-range`.
  - `Sharing.test.tsx`, `"uses a button bar for the export view and theme fields for text"`: after clicking Export, the Tree button's closest `.topcoat-button-bar` is non-null and the Tree button has class `topcoat-button-bar__button`; `getByLabelText("Import loop JSON")` has class `topcoat-textarea`; Export, Reset default beat and Import buttons have `topcoat-button`.
  - `StepGrid.test.tsx`, `"styles the mute-all button with the theme"`: the "Mute all" button has class `topcoat-button`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run examples/drum-machine/test/Controls.test.tsx examples/drum-machine/test/Sharing.test.tsx examples/drum-machine/test/StepGrid.test.tsx`
Expected: the three new tests FAIL; all existing ones pass.

- [ ] **Step 3: Apply the classes**

  - `Controls.tsx`: Play `topcoat-button--cta`, Pause and Stop `topcoat-button`; tempo input `topcoat-range`; `.controls` becomes a flex row that vertically centers the tempo label and its slider.
  - `StepGrid.tsx`: Mute all `topcoat-button`.
  - `Sharing.tsx`: Export, Reset default beat, Import buttons `topcoat-button`; Tree/Raw wrapped as `div.topcoat-button-bar > div.topcoat-button-bar__item > button.topcoat-button-bar__button` (keep the existing `role="group"` and `aria-pressed`, and put the group role on the bar element); both textareas `topcoat-textarea` (they already have `rows`; keep full width via the existing `.sharing textarea` rule); `[role="alert"]` colored with `var(--tc-invalid)`.
  - `styles.css`: add the `aria-pressed` stopgap described under Interfaces; delete the old `.export-toggle button[aria-pressed]` rule.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run examples/drum-machine`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/drum-machine
git commit -m "feat(demo): use theme buttons, range, button bar and textarea"
```

---

### Task 3: Step grid and lane pickers

**Files:**
- Modify: `examples/drum-machine/src/StepLanes.tsx` (selects), `examples/drum-machine/src/styles.css` (`.step`, `.step-label`, `.step-bar`, `.bar-heading`, `.lane`, `.lane-pickers` rules)
- Test: `test/StepLanes.test.tsx`

**Interfaces:**
- Consumes: app tokens `--pad-playhead` (Task 1).
- Produces: the app-local pad skin on `.step`: unpressed uses `--tc-surface-raised`, `--tc-border`, `--tc-shadow-inset`; pressed uses `--tc-cta-bg`, `--tc-cta-border`, `--tc-focus-inset`; beat steps (`data-beat`) get a stronger border via `--tc-text-muted`; playhead keeps `box-shadow: 0 0 0 3px var(--pad-playhead)`; `.step:focus-visible` uses `var(--tc-focus-ring)`. Same for `button.step-label`, with `text-decoration: line-through` kept for muted.

- [ ] **Step 1: Write the failing test**

`StepLanes.test.tsx`, `"styles the lane pickers with the theme"`: both comboboxes (`getAllByRole("combobox")`) have class `topcoat-text-input`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run examples/drum-machine/test/StepLanes.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Apply**

Add `topcoat-text-input` to both `<select>`s (keep the native arrow; if it renders wrong in either scheme, add the smallest `appearance`/padding fix in `.lane-pickers select` and note it for the register). Rewrite the `.step`, `.step-label`, `.step-bar`, `.bar-heading`, `.lane` rules to use only the tokens listed under Interfaces and `--tc-text`, `--tc-text-muted`, `--tc-border` for borders and headings. Borders between bars use `var(--tc-border)`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run examples/drum-machine`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/drum-machine
git commit -m "feat(demo): theme the step grid, pads and lane pickers"
```

---

### Task 4: Dial, JSON tree and the hex test going green

**Files:**
- Modify: `examples/drum-machine/src/styles.css` (`.dial*`, `.json-*` rules)
- Test: `test/styles.test.ts` (add the hex test)

**Interfaces:**
- Consumes: `--json-string`, `--json-number`, `--json-boolean` (Task 1).
- Produces: nothing new. Dial and tree markup is unchanged.

- [ ] **Step 1: Add the failing hex test**

In `styles.test.ts`, test name `"has no hex colors outside the named app tokens"`: remove lines that define `--pad-playhead`, `--json-string`, `--json-number` or `--json-boolean`, then assert the rest matches no `/#[0-9a-fA-F]{3,8}\b/`.

Run: `pnpm vitest run examples/drum-machine/test/styles.test.ts`
Expected: FAIL, with only dial and JSON-tree colors left.

- [ ] **Step 2: Replace the colors**

Dial: face stroke `var(--tc-border)`; pointer stroke `var(--tc-cta-bg)`; ticks `var(--tc-text-muted)` (drop the opacity rule); value bubble and edit field use `var(--tc-surface)`/`var(--tc-text)`/`var(--tc-border)` (a bubble with `--tc-text-strong` on `--tc-surface-active` is fine if the first reads weak); `.dial:focus-within` outline uses `var(--tc-focus-ring)`. JSON tree: `.json-view` border `var(--tc-border)` and background `var(--tc-input-bg)`; keys and null `var(--tc-text-muted)`; strings, numbers and booleans use the three `--json-*` tokens; the dotted guide line uses `var(--tc-border)`.

- [ ] **Step 3: Run the full suite, typecheck and build**

Run: `pnpm vitest run && pnpm --filter drum-machine typecheck && pnpm --filter drum-machine build`
Expected: everything PASSES, including both `styles.test.ts` tests.

- [ ] **Step 4: Commit**

```bash
git add examples/drum-machine
git commit -m "feat(demo): theme the dial and JSON tree; no hard-coded colors left"
```

---

### Task 5: Look at it, then write the gap register

**Files:**
- Create: `docs/superpowers/specs/2026-11-18-topcoat-gap-register.md`

**Interfaces:**
- Consumes: the finished app. Produces: the register (the spec's deliverable).

- [ ] **Step 1: Run the app and inspect light and dark**

Use the `run` skill to start `pnpm --filter drum-machine dev` and drive it in a browser. In each of light and dark (browser or OS color-scheme emulation), check and fix anything wrong: transport buttons, tempo range, pad off/on/beat/playhead and muted row, keyboard focus on a theme button and on a pad (a single ring, not two), the lane selects, a dial with value bubble and edit field, Tree/Raw switch selected state, import/export textareas, JSON tree colors.

- [ ] **Step 2: Check column alignment**

In the browser, with Bar 1 visible, compare the left edges of pad 1 and dial 1 and of pad 16 and dial 16 (`getBoundingClientRect`); the x-positions must match within 1px. Fix `styles.css` if not.

- [ ] **Step 3: Write the register**

One table, one row per gap found (start from the seed list in the spec; drop or add as the work showed). Columns: control; where used; what the theme gives today (and the stopgap used); skin (CSS) part; behavior (JS) part; recommended owner (theme, app, or split) and one sentence of why, applying the spec's rule of thumb. It must include at least: step pad, dial, `select`, Tree/Raw selected state (`aria-pressed` on a button-bar button), JSON tree, field label with error message, and the playhead/syntax highlight colors with no theme tokens. End with a short "decisions needed" list for the owner.

- [ ] **Step 4: Final verification**

Run: `pnpm vitest run && pnpm --filter drum-machine typecheck && pnpm --filter drum-machine build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-11-18-topcoat-gap-register.md examples/drum-machine
git commit -m "docs: topcoat gap register for the drum machine"
```

---

### Task 6: Swap stopgaps for the new theme primitives (runs once the theme session has landed them)

**Files:**
- Modify: `examples/drum-machine/package.json`, `pnpm-lock.yaml`, and whichever `src/*.tsx` and `src/styles.css` rules carry a `stopgap:` comment
- Test: the existing class-assertion tests from Tasks 2 and 3, updated to the new class names

**Interfaces:**
- Consumes: the theme's commit reported by the theme session, with the markup contracts from `specs/2026-11-18-topcoat-primitive-requests.md`: `[aria-pressed="true"]` styling on `topcoat-button` / `topcoat-button-bar__button`; `topcoat-select`; `topcoat-field`, `__label`, `__message`, `__message--invalid`; `--tc-highlight` / `bg-topcoat-highlight`; `topcoat-tooltip`.

- [ ] **Step 1: Update the theme and list what to swap**

Run: `pnpm --filter drum-machine update tailwind-topcoat`, then `grep -rn "stopgap:" examples/drum-machine/src`.
Expected: the lockfile moves to the new theme commit; the grep lists every stopgap to replace.

- [ ] **Step 2: Update the tests first**

Change the tests that assert stopgap classes: the lane-pickers test expects `topcoat-select`; the Sharing test additionally expects the Import field wrapper `topcoat-field` and the error list items `topcoat-field__message--invalid`; add `"uses the theme tooltip for the dial value"` in `Dial.test.tsx` asserting `.dial-value` also has `topcoat-tooltip`. Run them and confirm they FAIL.

- [ ] **Step 3: Swap and delete**

Apply the new classes, delete each `stopgap:` rule from `styles.css`, replace `--pad-playhead` with `var(--tc-highlight)` (and remove its definition and its entry from the hex-test allow-list), and keep the dial's `.dial-value` class alongside `topcoat-tooltip` because the tests query it.

- [ ] **Step 4: Verify and re-look**

Run: `pnpm vitest run && pnpm --filter drum-machine typecheck && pnpm --filter drum-machine build`, then repeat Task 5's light and dark inspection for the swapped elements. Update the gap register: mark each swapped row "adopted in theme" with the commit.
Expected: all PASS, and no `stopgap:` comments remain except for requests the theme did not deliver.

- [ ] **Step 5: Commit**

```bash
git add examples/drum-machine pnpm-lock.yaml docs/superpowers/specs/2026-11-18-topcoat-gap-register.md
git commit -m "feat(demo): adopt the new theme primitives in place of stopgaps"
```
