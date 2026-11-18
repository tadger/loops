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

const openImport = () => fireEvent.click(screen.getByRole("button", { name: "Import" }));

const importWith = (text: string) => {
  openImport();
  fireEvent.change(screen.getByLabelText("Import loop JSON"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Import loop" }));
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

describe("Sharing panel", () => {
  const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

  it("shows neither export nor import on load, with both toggles unpressed", () => {
    setup();
    expect(pressed("Export")).toBe("false");
    expect(pressed("Import")).toBe("false");
    expect(screen.queryByRole("group", { name: "Exported loop" })).toBeNull();
    expect(screen.queryByLabelText("Import loop JSON")).toBeNull();
  });

  it("opens one panel at a time and hides the open one when its toggle is pressed again", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(pressed("Export")).toBe("true");
    expect(screen.getByRole("group", { name: "Exported loop" })).toBeTruthy();

    openImport();
    expect(pressed("Import")).toBe("true");
    expect(pressed("Export")).toBe("false");
    expect(screen.queryByRole("group", { name: "Exported loop" })).toBeNull();
    expect(screen.getByLabelText("Import loop JSON")).toBeTruthy();

    openImport();
    expect(pressed("Import")).toBe("false");
    expect(screen.queryByLabelText("Import loop JSON")).toBeNull();
  });

  it("closes the import panel after a successful import", () => {
    const { loop, onImport } = setup();
    importWith(exportLoop(loop));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Import loop JSON")).toBeNull();
    expect(pressed("Import")).toBe("false");
  });

  it("keeps the import panel open and shows the errors when an import fails", () => {
    const { onImport } = setup();
    importWith("{nope");
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("Import loop JSON")).toBeTruthy();
    expect(pressed("Import")).toBe("true");
  });

  it("keeps Reset default beat as its own button", () => {
    setup();
    expect(screen.getByRole("button", { name: "Reset default beat" }).classList.contains("topcoat-button")).toBe(true);
  });
});

describe("Sharing theme", () => {
  it("uses a button bar for the share toggles and the export view, and theme fields for text", () => {
    setup();
    const toggles = screen.getByRole("group", { name: "Share" });
    expect(toggles.classList.contains("topcoat-button-bar")).toBe(true);
    for (const name of ["Export", "Import"]) {
      expect(screen.getByRole("button", { name }).classList.contains("topcoat-button-bar__button")).toBe(true);
    }

    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const tree = screen.getByRole("button", { name: "Tree" });
    expect(tree.closest(".topcoat-button-bar")).not.toBeNull();
    expect(tree.classList.contains("topcoat-button-bar__button")).toBe(true);

    openImport();
    expect(screen.getByLabelText("Import loop JSON").classList.contains("topcoat-textarea")).toBe(true);
    expect(screen.getByRole("button", { name: "Import loop" }).classList.contains("topcoat-button")).toBe(true);
  });

  it("labels the import box with the theme field and shows import errors as an invalid message", () => {
    setup();
    openImport();
    const label = screen.getByText("Import loop JSON");
    expect(label.classList.contains("topcoat-field__label")).toBe(true);
    expect(label.closest(".topcoat-field")?.contains(screen.getByLabelText("Import loop JSON"))).toBe(true);

    fireEvent.change(screen.getByLabelText("Import loop JSON"), { target: { value: "not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Import loop" }));
    const alert = screen.getByRole("alert");
    expect(alert.classList.contains("topcoat-field__message")).toBe(true);
    expect(alert.classList.contains("topcoat-field__message--invalid")).toBe(true);
  });
});
