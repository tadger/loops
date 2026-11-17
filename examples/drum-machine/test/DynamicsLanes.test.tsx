// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { Loop } from "@loops/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DynamicsLanes } from "../src/DynamicsLanes";
import type { DynamicsLanesProps } from "../src/DynamicsLanes";
import { createInitialLoop, getStepData, isStepOn, setStepData } from "../src/loop-state";

afterEach(cleanup);

const noop = () => {};
const LIT = [0, 7, 10];
const slider = (name: string) => screen.getByRole<HTMLInputElement>("slider", { name });

describe("DynamicsLanes", () => {
  it("renders 16 gain and 16 attack sliders, enabled only on lit steps", () => {
    const loop = createInitialLoop();
    render(<DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={noop} />);

    expect(screen.getAllByRole("slider")).toHaveLength(32);
    for (let step = 0; step < 16; step++) {
      for (const kind of ["gain", "attack"]) {
        expect(slider(`kick step ${step + 1} ${kind}`).disabled).toBe(!LIT.includes(step));
      }
    }
  });

  it("uses the documented ranges", () => {
    render(<DynamicsLanes loop={createInitialLoop()} channel="kick" onChannelChange={noop} onChange={noop} />);

    const gain = slider("kick step 1 gain");
    expect([gain.min, gain.max, gain.step]).toEqual(["0", "1", "0.01"]);
    const attack = slider("kick step 1 attack");
    expect([attack.min, attack.max, attack.step]).toEqual(["0", "100", "1"]);
  });

  it("shows the note's data, with attack in milliseconds", () => {
    const loop = setStepData(createInitialLoop(), "kick", 7, { gain: 0.4, attack: 0.05 });
    render(<DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={noop} />);

    expect(slider("kick step 8 gain").value).toBe("0.4");
    expect(slider("kick step 8 attack").value).toBe("50");
  });

  it("reports gain as-is and attack in seconds", () => {
    const onChange = vi.fn();
    render(<DynamicsLanes loop={createInitialLoop()} channel="kick" onChannelChange={noop} onChange={onChange} />);

    fireEvent.change(slider("kick step 8 gain"), { target: { value: "0.25" } });
    expect(onChange).toHaveBeenLastCalledWith("kick", 7, { gain: 0.25 });

    fireEvent.change(slider("kick step 8 attack"), { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith("kick", 7, { attack: 0.03 });
  });

  it("picks the channel through a labelled select", () => {
    const onChannelChange = vi.fn();
    const { rerender } = render(
      <DynamicsLanes loop={createInitialLoop()} channel="kick" onChannelChange={onChannelChange} onChange={noop} />,
    );

    const select = screen.getByLabelText<HTMLSelectElement>("Dynamics for");
    expect([...select.options].map((o) => o.value)).toEqual(["kick", "sd", "chh", "clap"]);
    fireEvent.change(select, { target: { value: "sd" } });
    expect(onChannelChange).toHaveBeenCalledExactlyOnceWith("sd");

    rerender(<DynamicsLanes loop={createInitialLoop()} channel="sd" onChannelChange={noop} onChange={noop} />);
    expect(select.value).toBe("sd");
    // sd is lit at steps 5 and 13
    expect(slider("sd step 5 gain").disabled).toBe(false);
    expect(slider("sd step 1 gain").disabled).toBe(true);
  });

  it("renders defaults for garbage, null or missing data without throwing", () => {
    const loop = {
      ...createInitialLoop(),
      channels: {
        kick: [
          { at: 0, data: "loud" },
          { at: 24, data: null },
          { at: 48 },
          { at: 72, data: { gain: "x", attack: [] } },
        ],
      },
    } as Loop;

    render(<DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={noop} />);

    for (const step of [1, 2, 3, 4]) {
      expect(slider(`kick step ${step} gain`).value).toBe("1");
      expect(slider(`kick step ${step} attack`).value).toBe("0");
    }
  });

  it("renders an old-format loop with only gain, defaulting attack", () => {
    const loop = { ...createInitialLoop(), channels: { kick: [{ at: 0, data: { gain: 0.5 } }] } } as Loop;
    render(<DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={noop} />);

    expect(slider("kick step 1 gain").value).toBe("0.5");
    expect(slider("kick step 1 attack").value).toBe("0");
  });

  it("shows only the first 16 steps of a longer loop, with extra channels present", () => {
    const loop: Loop = {
      ...createInitialLoop(),
      bars: 2,
      channels: {
        ...createInitialLoop().channels,
        kick: [{ at: 0, data: { gain: 0.5, attack: 0 } }, { at: 16 * 24 + 24, data: { gain: 0.2, attack: 0 } }],
        cowbell: [{ at: 0 }],
      },
    };

    render(<DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={noop} />);

    expect(screen.getAllByRole("slider")).toHaveLength(32);
    expect(slider("kick step 1 gain").value).toBe("0.5");
    expect(screen.queryByRole("slider", { name: "kick step 17 gain" })).toBeNull();
    expect(slider("kick step 2 gain").disabled).toBe(true);
  });

  it("applies consecutive edits through setStepData without touching other steps", () => {
    let latest = createInitialLoop();
    let change: DynamicsLanesProps["onChange"] = noop;
    function Wrapper() {
      const [loop, setLoop] = useState(latest);
      latest = loop;
      change = (channel, step, patch) => setLoop(setStepData(loop, channel, step, patch));
      return <DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={change} />;
    }
    const before = createInitialLoop();
    render(<Wrapper />);

    fireEvent.change(slider("kick step 1 gain"), { target: { value: "0.3" } });
    fireEvent.change(slider("kick step 8 attack"), { target: { value: "40" } });
    fireEvent.change(slider("kick step 8 gain"), { target: { value: "0.6" } });
    fireEvent.change(slider("kick step 11 attack"), { target: { value: "10" } });

    expect(getStepData(latest, "kick", 0)).toEqual({ gain: 0.3, attack: 0 });
    expect(getStepData(latest, "kick", 7)).toEqual({ gain: 0.6, attack: 0.04 });
    expect(getStepData(latest, "kick", 10)).toEqual({ gain: 1, attack: 0.01 });
    expect(latest.channels.sd).toEqual(before.channels.sd);
    expect(latest.channels.chh).toEqual(before.channels.chh);
    expect(slider("kick step 8 gain").value).toBe("0.6");
    expect(slider("kick step 8 attack").value).toBe("40");
  });

  it("cannot turn on or change a step that is off", () => {
    let latest = createInitialLoop();
    let change: DynamicsLanesProps["onChange"] = noop;
    function Wrapper() {
      const [loop, setLoop] = useState(latest);
      latest = loop;
      change = (channel, step, patch) => setLoop(setStepData(loop, channel, step, patch));
      return <DynamicsLanes loop={loop} channel="kick" onChannelChange={noop} onChange={change} />;
    }
    render(<Wrapper />);
    const before = latest;

    // Step 2 is off. jsdom delivers the event despite `disabled`, so setStepData must be the guard.
    fireEvent.change(slider("kick step 2 gain"), { target: { value: "0.5" } });
    act(() => change("kick", 1, { gain: 0.5, attack: 0.02 }));

    expect(latest).toBe(before);
    expect(isStepOn(latest, "kick", 1)).toBe(false);
    expect(slider("kick step 2 gain").disabled).toBe(true);
  });
});
