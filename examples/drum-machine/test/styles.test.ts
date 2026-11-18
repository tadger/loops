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
    const appTokens = /--(json-string|json-number|json-boolean):/;
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

  it("has no stopgap left now that the theme provides those primitives", () => {
    expect(css).not.toContain("stopgap:");
    expect(css).not.toContain("--pad-playhead");
    expect(css).not.toMatch(/aria-pressed="true"\]:focus/);
    expect(css).not.toMatch(/\[role="alert"\]\s*\{/);
  });
});
