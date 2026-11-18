/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

describe("styles.css", () => {
  it("imports tailwind and the theme", () => {
    const statements = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(statements.slice(0, 2)).toEqual(['@import "tailwindcss";', '@import "tailwind-topcoat";']);
  });

  it("has no hex colors outside the named app tokens", () => {
    const appTokens = /--(json-string|json-number|json-boolean|lcd-bg|lcd-text|lcd-glow):/;
    const rest = css
      .split("\n")
      .filter((line) => !appTokens.test(line))
      .join("\n");
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  const body = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  };

  it.each([".step:focus-visible", "button.step-label:focus-visible", ".dial:focus-within", ".json-toggle:focus-visible"])(
    "pairs the pale focus ring with the focus border on %s",
    (selector) => {
      const rule = body(selector);
      expect(rule).toContain("--tc-focus-ring");
      expect(rule).toContain("--tc-focus-border");
    },
  );

  const luminance = (hex: string): number => {
    const channel = (i: number) => {
      const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const token = (name: string): string => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? "";

  it("makes the LCD text brighter than its panel, at AA contrast or better", () => {
    const [bg, text] = [token("lcd-bg"), token("lcd-text")];
    expect(bg).not.toBe("");
    expect(text).not.toBe("");
    expect(luminance(text)).toBeGreaterThan(luminance(bg));
    expect((luminance(text) + 0.05) / (luminance(bg) + 0.05)).toBeGreaterThanOrEqual(7);
  });

  it("styles the sound labels as a recessed LCD in Doto with a bloom", () => {
    const rule = body("button.step-label.lcd");
    expect(rule).toContain("Doto Variable");
    expect(rule).toContain("var(--lcd-bg)");
    expect(rule).toContain("var(--lcd-text)");
    expect(rule).toMatch(/box-shadow:[^;]*inset/);
    const bloom = /text-shadow:([^;]*);/.exec(rule)?.[1] ?? "";
    expect(bloom.split(/,(?![^(]*\))/).length).toBeGreaterThanOrEqual(2);
  });

  it("stretches the LCD panel to the height of its row's pads, centering the text", () => {
    const rule = body("button.step-label.lcd");
    expect(rule).toContain("align-self: stretch");
    expect(rule).toContain("display: flex");
    expect(rule).toContain("align-items: center");
  });

  it("dims a muted sound's label and drops its bloom, dimming only the pads of its row", () => {
    const muted = body('button.step-label.lcd[aria-pressed="true"]');
    expect(muted).toContain("text-shadow: none");
    expect(muted).toContain("color-mix");
    expect(css).not.toMatch(/\.step-row\[data-muted\]\s*\{/);
    expect(body(".step-row[data-muted] .step")).toContain("opacity");
  });

  it("shows a muted sound by dimming alone, with no strikethrough", () => {
    expect(css).not.toContain("line-through");
  });

  it("loads the Doto font", () => {
    expect(readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8")).toContain("@fontsource-variable/doto");
  });

  it("has only the dialog stopgap left, waiting on the theme", () => {
    expect([...css.matchAll(/stopgap: ([\w-]+)/g)].map((match) => match[1])).toEqual(["topcoat-dialog"]);
    expect(css).not.toContain("--pad-playhead");
    expect(css).not.toMatch(/aria-pressed="true"\]:focus/);
    expect(css).not.toMatch(/\[role="alert"\]\s*\{/);
  });
});
