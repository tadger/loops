// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Loop } from "@loops/core";
import { StepGrid } from "../src/StepGrid";
import type { StepGridProps } from "../src/StepGrid";
import { CHANNELS, STEP_TICKS, isStepOn, removeBar, stepsInBar } from "../src/loop-state";
import { testLoop } from "./fixtures";
import "./dialog-stub";

afterEach(cleanup);

const noop = () => {};
const steps = () => screen.getAllByRole("button", { name: /step \d+$/ });

function grid(overrides: Partial<StepGridProps> = {}) {
  return (
    <StepGrid
      loop={testLoop()}
      onToggle={noop}
      playheadStep={null}
      muted={new Set()}
      onToggleMute={noop}
      onSetAllMuted={noop}
      onAddBar={noop}
      onRemoveBar={noop}
      canPaste={false}
      onCopyBar={noop}
      onPasteBar={noop}
      {...overrides}
    />
  );
}

describe("StepGrid", () => {
  it("shows a visible heading naming each bar, as the accessible name for its group", () => {
    render(grid({ loop: { ...testLoop(), bars: 2 } }));

    expect(screen.getByText("Bar 1")).toBeTruthy();
    expect(screen.getByText("Bar 2")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Bar 2" })).toBeTruthy();
  });

  it("renders a row of 16 buttons per channel, with aria-pressed matching the loop", () => {
    const loop = testLoop();
    render(grid({ loop }));

    const buttons = steps();
    expect(buttons).toHaveLength(CHANNELS.length * 16);
    CHANNELS.forEach((channel, row) => {
      for (let step = 0; step < 16; step++) {
        const pressed = buttons[row * 16 + step]!.getAttribute("aria-pressed");
        expect(pressed).toBe(String(isStepOn(loop, channel, step)));
      }
    });
  });

  it("calls onToggle with the channel and step of the clicked button", () => {
    const onToggle = vi.fn();
    render(grid({ onToggle }));

    fireEvent.click(screen.getByRole("button", { name: "kick step 4" }));

    expect(onToggle).toHaveBeenCalledExactlyOnceWith("kick", 3);
  });

  it("marks exactly the buttons of the playhead column", () => {
    const { rerender } = render(grid({ playheadStep: 5 }));

    const marked = () => steps().filter((b) => b.hasAttribute("data-playhead"));
    const buttons = steps();
    expect(marked()).toEqual(CHANNELS.map((_, row) => buttons[row * 16 + 5]));

    rerender(grid({ playheadStep: null }));
    expect(marked()).toEqual([]);
  });

  describe("mute", () => {
    it("renders one mute button per channel, named for the channel, reflecting muted state", () => {
      render(grid({ muted: new Set(["snare"]) }));

      expect(screen.getByRole("button", { name: "kick" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "snare" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("calls onToggleMute with the clicked channel", () => {
      const onToggleMute = vi.fn();
      render(grid({ onToggleMute }));

      fireEvent.click(screen.getByRole("button", { name: "hihat" }));

      expect(onToggleMute).toHaveBeenCalledExactlyOnceWith("hihat");
    });

    it("marks a muted channel's row with data-muted", () => {
      render(grid({ muted: new Set(["snare"]) }));

      expect(screen.getByRole("button", { name: "snare" }).closest(".step-row")!.hasAttribute("data-muted")).toBe(true);
      expect(screen.getByRole("button", { name: "kick" }).closest(".step-row")!.hasAttribute("data-muted")).toBe(false);
    });

    describe("mute all / unmute all", () => {
      it("reads 'Mute all' when any channel is unmuted, and mutes every channel when clicked", () => {
        const onSetAllMuted = vi.fn();
        render(grid({ muted: new Set(["snare"]), onSetAllMuted }));

        const button = screen.getByRole("button", { name: "Mute all" });
        fireEvent.click(button);

        expect(onSetAllMuted).toHaveBeenCalledExactlyOnceWith(true);
      });

      it("reads 'Unmute all' once every channel is muted, and unmutes every channel when clicked", () => {
        const onSetAllMuted = vi.fn();
        render(grid({ muted: new Set(CHANNELS), onSetAllMuted }));

        const button = screen.getByRole("button", { name: "Unmute all" });
        fireEvent.click(button);

        expect(onSetAllMuted).toHaveBeenCalledExactlyOnceWith(false);
      });
    });
  });

  describe("multiple bars", () => {
    const twoBars = (): Loop => ({ ...testLoop(), bars: 2 });
    const rowOf = (group: HTMLElement, channel: string) =>
      within(group).getAllByRole("button", { name: new RegExp(`^${channel} step `) });

    it("renders one labelled group per bar with a full row per channel", () => {
      render(grid({ loop: twoBars() }));

      expect(screen.getByRole("group", { name: "Bar 1" })).toBeTruthy();
      expect(screen.getByRole("group", { name: "Bar 2" })).toBeTruthy();
      for (const channel of CHANNELS) {
        expect(screen.getAllByRole("button", { name: new RegExp(`^${channel} step `) })).toHaveLength(32);
      }
      expect(rowOf(screen.getByRole("group", { name: "Bar 2" }), "kick")).toHaveLength(16);
    });

    it("numbers steps globally across bars and reports the global step", () => {
      const onToggle = vi.fn();
      render(grid({ loop: twoBars(), onToggle }));

      const bar2 = screen.getByRole("group", { name: "Bar 2" });
      expect(rowOf(bar2, "kick")[0]!.getAttribute("aria-label")).toBe("kick step 17");
      fireEvent.click(within(bar2).getByRole("button", { name: "kick step 17" }));

      expect(onToggle).toHaveBeenCalledExactlyOnceWith("kick", 16);
    });

    it("marks only the playhead's global step", () => {
      render(grid({ loop: twoBars(), playheadStep: 20 }));

      const marked = steps().filter((b) => b.hasAttribute("data-playhead"));
      expect(marked.map((b) => b.getAttribute("aria-label"))).toEqual(CHANNELS.map((c) => `${c} step 21`));
    });

    it("marks every fourth step of each bar as a beat", () => {
      render(grid({ loop: twoBars() }));

      const beats = (bar: string) =>
        rowOf(screen.getByRole("group", { name: bar }), "kick").flatMap((b, i) => (b.hasAttribute("data-beat") ? [i] : []));
      expect(beats("Bar 1")).toEqual([0, 4, 8, 12]);
      expect(beats("Bar 2")).toEqual([0, 4, 8, 12]);
    });

    it("lights the nearest step of a nudged note in a later bar", () => {
      const loop = twoBars();
      loop.channels.bass = [{ at: 20 * STEP_TICKS - 5 }];
      render(grid({ loop }));

      const pressed = screen
        .getAllByRole("button", { name: /^bass step / })
        .filter((b) => b.getAttribute("aria-pressed") === "true");
      expect(pressed.map((b) => b.getAttribute("aria-label"))).toEqual(["bass step 21"]);
    });
  });

  it("renders a single group for a one-bar loop", () => {
    render(grid());

    expect(screen.getAllByRole("group", { name: /^Bar \d+$/ })).toHaveLength(1);
  });

  it("sizes a 3-beat bar to 12 steps and exposes it as --steps", () => {
    const loop = { ...testLoop(), beatsPerBar: 3, channels: {} };
    render(grid({ loop }));

    const bar = screen.getByRole("group", { name: "Bar 1" });
    expect(within(bar).getAllByRole("button", { name: /^kick step / })).toHaveLength(12);
    expect(bar.style.getPropertyValue("--steps")).toBe("12");
  });

  it("renders only kit channels, leaving absent ones as empty rows", () => {
    const loop = { ...testLoop(), channels: { kick: [{ at: 0 }], extra: [{ at: 0 }] } };
    render(grid({ loop }));

    expect(screen.queryByRole("button", { name: /^extra step / })).toBeNull();
    const buttons = steps();
    expect(buttons).toHaveLength(CHANNELS.length * 16);
    expect(screen.getByRole("button", { name: "kick step 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "snare step 1" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("StepGrid theme", () => {
  it("styles the mute-all button with the theme", () => {
    render(grid());
    expect(screen.getByRole("button", { name: "Mute all" }).classList.contains("topcoat-button")).toBe(true);
  });
});

describe("StepGrid LCD", () => {
  it("shows each sound's name on an LCD panel", () => {
    render(grid());
    for (const channel of CHANNELS) {
      const label = screen.getAllByRole("button", { name: channel })[0]!;
      expect(label.classList.contains("lcd")).toBe(true);
    }
  });
});

describe("StepGrid bars", () => {
  const twoBars = (): Loop => ({ ...testLoop(), bars: 2 });
  const dialog = () => document.querySelector("dialog")!;

  it("adds a bar with the Add bar button", () => {
    const onAddBar = vi.fn();
    render(grid({ onAddBar }));
    fireEvent.click(screen.getByRole("button", { name: "Add bar" }));
    expect(onAddBar).toHaveBeenCalledTimes(1);
  });

  it("gives each bar a Remove bar button, disabled when only one bar is left", () => {
    const one = render(grid());
    expect((screen.getByRole("button", { name: "Remove bar 1" }) as HTMLButtonElement).disabled).toBe(true);
    one.unmount();
    render(grid({ loop: twoBars() }));
    expect((screen.getByRole("button", { name: "Remove bar 1" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Remove bar 2" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("removes an empty bar straight away", () => {
    const onRemoveBar = vi.fn();
    render(grid({ loop: twoBars(), onRemoveBar }));
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 2" }));
    expect(onRemoveBar).toHaveBeenCalledWith(1);
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("asks before removing a bar that has steps, naming the bar and the count", () => {
    const onRemoveBar = vi.fn();
    const loop = twoBars();
    const count = stepsInBar(loop, 0);
    expect(count).toBeGreaterThan(1);
    render(grid({ loop, onRemoveBar }));
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 1" }));
    expect(dialog().hasAttribute("open")).toBe(true);
    expect(screen.getByRole("dialog", { name: "Remove bar 1?" })).toBe(dialog());
    expect(screen.getByText(`Bar 1 has ${count} steps. Removing it deletes them.`)).toBeTruthy();
    expect(onRemoveBar).not.toHaveBeenCalled();
  });

  it("says 1 step, not 1 steps", () => {
    render(grid({ loop: { ...twoBars(), channels: { kick: [{ at: 0 }] } } }));
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 1" }));
    expect(screen.getByText("Bar 1 has 1 step. Removing it deletes it.")).toBeTruthy();
  });

  it("closes on Cancel without removing, and removes that bar and closes on the confirm button", () => {
    const onRemoveBar = vi.fn();
    render(grid({ loop: twoBars(), onRemoveBar }));
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(onRemoveBar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove bar 1" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Remove bar" }));
    expect(onRemoveBar).toHaveBeenCalledTimes(1);
    expect(onRemoveBar).toHaveBeenCalledWith(0);
    expect(dialog().hasAttribute("open")).toBe(false);
  });
});

describe("StepGrid focus after removing a bar", () => {
  function Harness({ initial }: { initial: Loop }) {
    const [loop, setLoop] = useState(initial);
    return grid({ loop, onRemoveBar: (bar) => setLoop((current) => removeBar(current, bar)) });
  }
  const bars = (n: number): Loop => ({ ...testLoop(), bars: n });
  const focusedName = () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent;

  it("moves focus to the previous bar's Remove button after removing the last bar", () => {
    render(<Harness initial={bars(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 3" }));
    expect(focusedName()).toBe("Remove bar 2");
  });

  it("keeps focus at the same position after removing a middle bar", () => {
    render(<Harness initial={bars(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 2" }));
    expect(focusedName()).toBe("Remove bar 2");
  });

  it("moves focus to Add bar when removing leaves a single bar, whose Remove button is disabled", () => {
    render(<Harness initial={bars(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 2" }));
    expect(focusedName()).toBe("Add bar");
  });

  it("does the same after confirming the removal of a bar that has steps", () => {
    render(<Harness initial={bars(2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove bar 1" }));
    fireEvent.click(within(document.querySelector("dialog")!).getByRole("button", { name: "Remove bar" }));
    expect(focusedName()).toBe("Add bar");
  });
});

describe("StepGrid copy and paste", () => {
  const twoBars = (): Loop => ({ ...testLoop(), bars: 2 });
  // The grid has a dialog for removing and, after it, one for replacing; this is the replace one.
  const dialog = () => document.querySelectorAll("dialog")[1]!;
  const open = () => document.querySelector("dialog[open]");
  const paste = (bar: number) => screen.getByRole("button", { name: `Paste into bar ${bar}` }) as HTMLButtonElement;

  it("gives each bar a Copy button that copies that bar", () => {
    const onCopyBar = vi.fn();
    render(grid({ loop: twoBars(), onCopyBar }));
    fireEvent.click(screen.getByRole("button", { name: "Copy bar 2" }));
    expect(onCopyBar).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy bar 1" }));
    expect(onCopyBar).toHaveBeenLastCalledWith(0);
  });

  it("disables every Paste button until something is copied", () => {
    const off = render(grid({ loop: twoBars() }));
    expect(paste(1).disabled).toBe(true);
    expect(paste(2).disabled).toBe(true);
    off.unmount();
    render(grid({ loop: twoBars(), canPaste: true }));
    expect(paste(1).disabled).toBe(false);
    expect(paste(2).disabled).toBe(false);
  });

  it("pastes into an empty bar straight away", () => {
    const onPasteBar = vi.fn();
    render(grid({ loop: twoBars(), canPaste: true, onPasteBar }));
    fireEvent.click(paste(2));
    expect(onPasteBar).toHaveBeenCalledExactlyOnceWith(1);
    expect(dialog().hasAttribute("open")).toBe(false);
  });

  it("asks before replacing a bar that has steps, naming the bar and the count", () => {
    const onPasteBar = vi.fn();
    const loop = twoBars();
    const count = stepsInBar(loop, 0);
    render(grid({ loop, canPaste: true, onPasteBar }));
    fireEvent.click(paste(1));
    expect(screen.getByRole("dialog", { name: "Replace bar 1?" })).toBe(dialog());
    expect(open()).toBe(dialog());
    expect(screen.getByText(`Bar 1 has ${count} steps. Pasting replaces them.`)).toBeTruthy();
    expect(onPasteBar).not.toHaveBeenCalled();
  });

  it("says 1 step, not 1 steps", () => {
    render(grid({ loop: { ...twoBars(), channels: { kick: [{ at: 0 }] } }, canPaste: true }));
    fireEvent.click(paste(1));
    expect(screen.getByText("Bar 1 has 1 step. Pasting replaces it.")).toBeTruthy();
  });

  it("closes on Cancel without pasting, and pastes into that bar on the confirm button", () => {
    const onPasteBar = vi.fn();
    render(grid({ loop: twoBars(), canPaste: true, onPasteBar }));
    fireEvent.click(paste(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog().hasAttribute("open")).toBe(false);
    expect(onPasteBar).not.toHaveBeenCalled();

    fireEvent.click(paste(1));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Replace" }));
    expect(onPasteBar).toHaveBeenCalledExactlyOnceWith(0);
    expect(dialog().hasAttribute("open")).toBe(false);
  });
});
