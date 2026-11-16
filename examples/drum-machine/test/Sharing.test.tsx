// @vitest-environment jsdom
import { parseLoop } from "@loops/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sharing } from "../src/Sharing";
import { createInitialLoop } from "../src/loop-state";
import { exportLoop } from "../src/persistence";

afterEach(cleanup);

function setup() {
  const loop = createInitialLoop();
  const onImport = vi.fn();
  render(<Sharing loop={loop} onImport={onImport} />);
  return { loop, onImport };
}

const importWith = (text: string) => {
  fireEvent.change(screen.getByLabelText("Import loop JSON"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
};

describe("Sharing", () => {
  it("exports the loop's canonical JSON in a read-only textarea", () => {
    const { loop } = setup();
    expect(screen.queryByLabelText("Exported loop")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    const out = screen.getByLabelText("Exported loop") as HTMLTextAreaElement;
    expect(out.readOnly).toBe(true);
    expect(out.value).toBe(exportLoop(loop));
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
});
