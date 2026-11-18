// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { serializeLoop } from "@loops/core";
import type { Json } from "@loops/core";
import { JsonTree } from "../src/JsonTree";
import { testLoop } from "./fixtures";

afterEach(cleanup);

describe("JsonTree", () => {
  it("renders primitive leaves with JSON-quoted strings and literal booleans/null", () => {
    render(
      <>
        <JsonTree value={42} />
        <JsonTree value="hi" />
        <JsonTree value={true} />
        <JsonTree value={false} />
        <JsonTree value={null} />
      </>,
    );

    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText('"hi"')).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
    expect(screen.getByText("false")).toBeTruthy();
    expect(screen.getByText("null")).toBeTruthy();
  });

  it("is expanded by default: an object's values are visible with no interaction", () => {
    render(<JsonTree value={{ a: 1, b: "x" }} />);

    expect(screen.getByRole("button", { name: "2 keys" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText('"x"')).toBeTruthy();
  });

  it("collapses to a bracketed item-count summary, pluralized correctly", () => {
    render(<JsonTree value={[1, 2, 3]} />);

    fireEvent.click(screen.getByRole("button", { name: "3 items" }));

    expect(screen.getByText("[3 items]")).toBeTruthy();
    expect(screen.queryByText("1")).toBeNull();
  });

  it("uses singular wording for one key/item", () => {
    render(
      <>
        <JsonTree name="obj" value={{ a: 1 }} />
        <JsonTree name="arr" value={[1]} />
      </>,
    );

    expect(screen.getByRole("button", { name: "obj: 1 key" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "arr: 1 item" })).toBeTruthy();
  });

  it("folds and unfolds branches independently", () => {
    render(<JsonTree value={{ a: { x: 1 }, b: { y: 2 } }} />);

    fireEvent.click(screen.getByRole("button", { name: "a: 1 key" }));

    expect(screen.getByRole("button", { name: "a: 1 key" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("1")).toBeNull();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "b: 1 key" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("renders a real exported loop's shape, foldable into its channels", () => {
    const value = serializeLoop(testLoop()) as unknown as Json;
    render(<JsonTree value={value} />);

    expect(screen.getByText(/^92$/)).toBeTruthy(); // tempo
    expect(screen.getByRole("button", { name: /^channels: \d+ keys$/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^kick: \d+ items$/ }));
    expect(screen.getByRole("button", { name: /^kick: \d+ items$/ }).getAttribute("aria-expanded")).toBe("false");
  });
});
