// @vitest-environment jsdom
import { parseLoop } from "@loops/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sharing } from "../src/Sharing";
import { testLoop } from "./fixtures";
import { exportLoop } from "../src/persistence";

afterEach(cleanup);

function setup() {
  const loop = testLoop();
  const onImport = vi.fn();
  const onReset = vi.fn();
  render(<Sharing loop={loop} onImport={onImport} onReset={onReset} />);
  return { loop, onImport, onReset };
}

const importWith = (text: string) => {
  fireEvent.change(screen.getByLabelText("Import loop JSON"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
};

describe("Sharing", () => {
  it("shows the exported loop as a fold-able tree by default, not the raw textarea", () => {
    const { loop } = setup();
    expect(screen.queryByRole("textbox", { name: "Exported loop" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.queryByRole("textbox", { name: "Exported loop" })).toBeNull();
    expect(screen.getByRole("group", { name: "Exported loop" })).toBeTruthy();
    expect(screen.getByText(String(loop.tempo))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tree" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Raw" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles to the unchanged raw read-only textarea and back", () => {
    const { loop } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    const out = screen.getByLabelText("Exported loop") as HTMLTextAreaElement;
    expect(out.readOnly).toBe(true);
    expect(out.value).toBe(exportLoop(loop));
    expect(screen.getByRole("button", { name: "Raw" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Tree" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.queryByRole("textbox", { name: "Exported loop" })).toBeNull();
    expect(screen.getByRole("group", { name: "Exported loop" })).toBeTruthy();
  });

  it("imports valid JSON without showing an alert", () => {
    const { loop, onImport } = setup();
    importWith(exportLoop(loop));
    expect(onImport).toHaveBeenCalledTimes(1);
    const parsed = parseLoop(JSON.parse(exportLoop(loop)));
    expect(parsed.ok).toBe(true);
    expect(onImport.mock.calls[0]![0]).toEqual(parsed.ok && parsed.loop);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a JSON diagnostic and does not import invalid JSON", () => {
    const { onImport } = setup();
    importWith("{nope");
    expect(screen.getByRole("alert").textContent).toContain("JSON");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("lists the offending path for a loop with tempo 0", () => {
    const { loop, onImport } = setup();
    importWith(JSON.stringify({ ...JSON.parse(exportLoop(loop)), tempo: 0 }));
    const items = screen.getAllByRole("listitem");
    expect(items.some((li) => li.textContent!.startsWith("tempo"))).toBe(true);
    expect(onImport).not.toHaveBeenCalled();
  });

  describe("reset", () => {
    const click = () => fireEvent.click(screen.getByRole("button", { name: "Reset default beat" }));
    afterEach(() => vi.restoreAllMocks());

    it("asks first and resets when confirmed", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onReset } = setup();
      click();
      expect(confirm).toHaveBeenCalledWith("Replace your loop with the default beat?");
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("does nothing when cancelled", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { onReset } = setup();
      click();
      expect(onReset).not.toHaveBeenCalled();
    });
  });
});
