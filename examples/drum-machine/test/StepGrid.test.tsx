// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Loop } from "@loops/core";
import { StepGrid } from "../src/StepGrid";
import type { StepGridProps } from "../src/StepGrid";
import { CHANNELS, STEP_TICKS, isStepOn } from "../src/loop-state";
import { testLoop } from "./fixtures";

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
