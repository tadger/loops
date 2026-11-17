// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { Loop } from "@loops/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepLanes } from "../src/StepLanes";
import type { StepLanesProps } from "../src/StepLanes";
import { CHANNELS, createInitialLoop, getNudge, getStepData, isStepOn, setNudge, setStepData } from "../src/loop-state";

afterEach(cleanup);

const noop = () => {};
const LIT = [0, 7, 10];
const slider = (name: string) => screen.getByRole<HTMLInputElement>("slider", { name });
const twoBars = (): Loop => ({ ...createInitialLoop(), bars: 2 });

function lanes(props: Partial<StepLanesProps> = {}) {
  return (
    <StepLanes
      loop={createInitialLoop()}
      channel="kick"
      param="gain"
      onChannelChange={noop}
      onParamChange={noop}
      onEdit={noop}
      {...props}
    />
  );
}

describe("StepLanes", () => {
  it("renders one row of 16 sliders per bar, numbered through the whole loop", () => {
    render(lanes({ loop: twoBars() }));

    expect(screen.getAllByRole("slider")).toHaveLength(32);
    expect(screen.getAllByRole("group", { name: /^Bar \d+ gain$/ })).toHaveLength(2);
    expect(within(screen.getByRole("group", { name: "Bar 2 gain" })).getAllByRole("slider")).toHaveLength(16);
    const names = screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"));
    expect(names).toEqual(Array.from({ length: 32 }, (_, i) => `kick step ${i + 1} gain`));
  });

  it("renders one row for a one-bar loop", () => {
    render(lanes());

    expect(screen.getAllByRole("group", { name: /^Bar \d+ gain$/ })).toHaveLength(1);
    expect(screen.getAllByRole("slider")).toHaveLength(16);
  });

  it("sets --steps from the loop's steps per bar, so a 3-beat loop keeps its columns", () => {
    render(lanes({ loop: { ...createInitialLoop(), beatsPerBar: 3, bars: 2, channels: {} } }));

    expect(screen.getAllByRole("slider")).toHaveLength(24);
    const rows = screen.getAllByRole("group", { name: /^Bar \d+ gain$/ });
    // The variable must reach every row, from the row itself or an ancestor.
    for (const row of rows) {
      const owner = row.closest<HTMLElement>("[style*='--steps']");
      expect(owner?.style.getPropertyValue("--steps")).toBe("12");
    }
  });

  it("enables sliders only on lit steps", () => {
    render(lanes());

    for (let step = 0; step < 16; step++) {
      expect(slider(`kick step ${step + 1} gain`).disabled).toBe(!LIT.includes(step));
    }
  });

  it("shows the parameter's range and the default on a disabled slider", () => {
    render(lanes({ param: "decay" }));

    const off = slider("kick step 2 decay");
    expect([off.min, off.max, off.step]).toEqual(["20", "2000", "10"]);
    expect(off.value).toBe("2000");
    expect(off.getAttribute("aria-valuetext")).toBe("off");
  });

  it("switches parameter through a labelled select and renames the sliders", () => {
    const onParamChange = vi.fn();
    const { rerender } = render(lanes({ onParamChange }));

    const select = screen.getByLabelText<HTMLSelectElement>("Parameter");
    expect([...select.options].map((o) => o.value)).toEqual(["gain", "decay", "pitch", "timing"]);
    expect(select.value).toBe("gain");
    fireEvent.change(select, { target: { value: "timing" } });
    expect(onParamChange).toHaveBeenCalledExactlyOnceWith("timing");

    rerender(lanes({ param: "timing", onParamChange }));
    expect(select.value).toBe("timing");
    expect(screen.queryByRole("slider", { name: "kick step 1 gain" })).toBeNull();
    const nudge = slider("kick step 8 timing");
    expect([nudge.min, nudge.max, nudge.step]).toEqual(["-11", "11", "1"]);
    expect(nudge.disabled).toBe(false);
    expect(nudge.getAttribute("aria-valuetext")).toBe("on the grid");
  });

  it("describes each value with aria-valuetext", () => {
    let loop = setNudge(createInitialLoop(), "kick", 7, 2);
    loop = setStepData(loop, "kick", 7, { gain: 0.8, decay: 0.5, rate: 0.5 });
    const { rerender } = render(lanes({ loop, param: "timing" }));
    expect(slider("kick step 8 timing").getAttribute("aria-valuetext")).toBe("2 ticks late");

    rerender(lanes({ loop, param: "gain" }));
    expect(slider("kick step 8 gain").getAttribute("aria-valuetext")).toBe("80%");
    rerender(lanes({ loop, param: "decay" }));
    expect(slider("kick step 8 decay").getAttribute("aria-valuetext")).toBe("500 ms");
    rerender(lanes({ loop, param: "pitch" }));
    expect(slider("kick step 8 pitch").getAttribute("aria-valuetext")).toBe("−12.0 st");
  });

  it("clamps an imported tie's nudge into the slider's range", () => {
    const loop: Loop = { ...createInitialLoop(), channels: { kick: [{ at: 36 }] } };
    render(lanes({ loop, param: "timing" }));

    const tie = slider("kick step 3 timing");
    expect(tie.value).toBe("-11");
    expect(tie.getAttribute("aria-valuetext")).toBe("11 ticks early");
  });

  it("passes the edited loop to onEdit when a lit step's slider moves", () => {
    const onEdit = vi.fn();
    const loop = createInitialLoop();
    render(lanes({ loop, onEdit }));

    fireEvent.change(slider("kick step 8 gain"), { target: { value: "0.25" } });

    expect(onEdit).toHaveBeenCalledOnce();
    const edited = onEdit.mock.calls[0]![0] as Loop;
    expect(getStepData(edited, "kick", 7)).toEqual({ gain: 0.25, decay: 2, rate: 1 });
    expect(edited.channels.sd).toBe(loop.channels.sd);
  });

  it("edits the selected parameter and channel", () => {
    const onEdit = vi.fn();
    render(lanes({ channel: "sd", param: "timing", onEdit }));

    fireEvent.change(slider("sd step 5 timing"), { target: { value: "-6" } });

    expect(getNudge(onEdit.mock.calls[0]![0] as Loop, "sd", 4)).toBe(-6);
  });

  it("picks the channel through a labelled select listing exactly the kit", () => {
    const onChannelChange = vi.fn();
    const { rerender } = render(lanes({ onChannelChange }));

    const select = screen.getByLabelText<HTMLSelectElement>("Lane for");
    expect([...select.options].map((o) => o.value)).toEqual([...CHANNELS]);
    fireEvent.change(select, { target: { value: "sd" } });
    expect(onChannelChange).toHaveBeenCalledExactlyOnceWith("sd");

    rerender(lanes({ channel: "sd" }));
    expect(select.value).toBe("sd");
    // sd is lit at steps 5 and 13
    expect(slider("sd step 5 gain").disabled).toBe(false);
    expect(slider("sd step 1 gain").disabled).toBe(true);
  });

  it("lists only kit channels even when the loop has others", () => {
    const loop: Loop = { ...createInitialLoop(), channels: { ...createInitialLoop().channels, cowbell: [{ at: 0 }] } };
    render(lanes({ loop }));

    expect([...screen.getByLabelText<HTMLSelectElement>("Lane for").options].map((o) => o.value)).toEqual([...CHANNELS]);
  });

  it("renders defaults for garbage, null or missing data without throwing", () => {
    const loop = {
      ...createInitialLoop(),
      channels: {
        kick: [
          { at: 0, data: "loud" },
          { at: 24, data: null },
          { at: 48 },
          { at: 72, data: { gain: "x", decay: [], rate: {} } },
        ],
      },
    } as Loop;

    const { rerender } = render(lanes({ loop }));
    for (const step of [1, 2, 3, 4]) expect(slider(`kick step ${step} gain`).value).toBe("1");
    rerender(lanes({ loop, param: "decay" }));
    for (const step of [1, 2, 3, 4]) expect(slider(`kick step ${step} decay`).value).toBe("2000");
    rerender(lanes({ loop, param: "pitch" }));
    for (const step of [1, 2, 3, 4]) expect(slider(`kick step ${step} pitch`).value).toBe("0");
  });

  it("reads an old-format loop with only gain, defaulting the rest", () => {
    const loop = { ...createInitialLoop(), channels: { kick: [{ at: 0, data: { gain: 0.5 } }] } } as Loop;
    const { rerender } = render(lanes({ loop }));

    expect(slider("kick step 1 gain").value).toBe("0.5");
    rerender(lanes({ loop, param: "decay" }));
    expect(slider("kick step 1 decay").value).toBe("2000");
  });

  describe("driven by state", () => {
    function Harness({ initial, onLoop }: { initial: Loop; onLoop(loop: Loop): void }) {
      const [loop, setLoop] = useState(initial);
      const [channel, setChannel] = useState<string>("kick");
      const [param, setParam] = useState<StepLanesProps["param"]>("gain");
      onLoop(loop);
      return (
        <StepLanes
          loop={loop}
          channel={channel}
          param={param}
          onChannelChange={setChannel}
          onParamChange={setParam}
          onEdit={setLoop}
        />
      );
    }

    it("applies consecutive edits across parameters without touching other steps", () => {
      const before = createInitialLoop();
      let latest = before;
      render(<Harness initial={before} onLoop={(l) => (latest = l)} />);

      fireEvent.change(slider("kick step 1 gain"), { target: { value: "0.3" } });
      fireEvent.change(slider("kick step 8 gain"), { target: { value: "0.6" } });
      fireEvent.change(screen.getByLabelText("Parameter"), { target: { value: "decay" } });
      fireEvent.change(slider("kick step 8 decay"), { target: { value: "400" } });
      fireEvent.change(screen.getByLabelText("Parameter"), { target: { value: "timing" } });
      fireEvent.change(slider("kick step 11 timing"), { target: { value: "3" } });

      expect(getStepData(latest, "kick", 0)).toEqual({ gain: 0.3, decay: 2, rate: 1 });
      expect(getStepData(latest, "kick", 7)).toEqual({ gain: 0.6, decay: 0.4, rate: 1 });
      expect(getNudge(latest, "kick", 10)).toBe(3);
      expect(latest.channels.sd).toEqual(before.channels.sd);
      expect(slider("kick step 11 timing").value).toBe("3");
      expect(slider("kick step 11 timing").getAttribute("aria-valuetext")).toBe("3 ticks late");
    });

    it("keeps no state of one channel when switching to another", () => {
      let latest = createInitialLoop();
      render(<Harness initial={latest} onLoop={(l) => (latest = l)} />);

      fireEvent.change(slider("kick step 8 gain"), { target: { value: "0.2" } });
      fireEvent.change(screen.getByLabelText("Lane for"), { target: { value: "sd" } });

      expect(screen.queryByRole("slider", { name: /^kick step/ })).toBeNull();
      expect(slider("sd step 5 gain").value).toBe("1");
      expect(slider("sd step 5 gain").disabled).toBe(false);
      expect(slider("sd step 8 gain").disabled).toBe(true);
      expect(getStepData(latest, "sd", 4)).toEqual({ gain: 1, decay: 2, rate: 1 });
    });
  });

  it("cannot turn on or change a step that is off", () => {
    let latest = createInitialLoop();
    const before = latest;
    const onEdit = (loop: Loop) => (latest = loop);
    const { rerender } = render(lanes({ loop: before, onEdit }));

    // Step 2 is off. jsdom delivers the event despite `disabled`, so the setters must be the guard.
    fireEvent.change(slider("kick step 2 gain"), { target: { value: "0.5" } });
    rerender(lanes({ loop: before, onEdit, param: "timing" }));
    fireEvent.change(slider("kick step 2 timing"), { target: { value: "4" } });

    expect(latest).toBe(before);
    expect(isStepOn(latest, "kick", 1)).toBe(false);
    expect(slider("kick step 2 timing").disabled).toBe(true);
  });
});
