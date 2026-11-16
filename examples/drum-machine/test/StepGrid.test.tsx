// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepGrid } from "../src/StepGrid";
import { CHANNELS, createInitialLoop, isStepOn } from "../src/loop-state";

afterEach(cleanup);

const noop = () => {};

describe("StepGrid", () => {
  it("renders a 4x16 grid of buttons whose aria-pressed matches the loop", () => {
    const loop = createInitialLoop();
    render(<StepGrid loop={loop} onToggle={noop} playheadStep={null} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(64);
    CHANNELS.forEach((channel, row) => {
      for (let step = 0; step < 16; step++) {
        const pressed = buttons[row * 16 + step]!.getAttribute("aria-pressed");
        expect(pressed).toBe(String(isStepOn(loop, channel, step)));
      }
    });
  });

  it("calls onToggle with the channel and step of the clicked button", () => {
    const onToggle = vi.fn();
    render(<StepGrid loop={createInitialLoop()} onToggle={onToggle} playheadStep={null} />);

    fireEvent.click(screen.getByRole("button", { name: "kick step 4" }));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith("kick", 3);
  });

  it("marks exactly the buttons of the playhead column", () => {
    const { rerender } = render(<StepGrid loop={createInitialLoop()} onToggle={noop} playheadStep={5} />);

    const marked = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-playhead"));
    const buttons = screen.getAllByRole("button");
    expect(marked()).toEqual(CHANNELS.map((_, row) => buttons[row * 16 + 5]));

    rerender(<StepGrid loop={createInitialLoop()} onToggle={noop} playheadStep={null} />);
    expect(marked()).toEqual([]);
  });
});
