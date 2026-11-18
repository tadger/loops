// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dial } from "../src/Dial";
import type { DialProps } from "../src/Dial";

afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());

const format = (v: number) => `${v}`;

function dial(overrides: Partial<DialProps> = {}) {
  return (
    <Dial
      value={5}
      min={0}
      max={10}
      step={1}
      defaultValue={0}
      disabled={false}
      label="kick step 1 gain"
      format={format}
      onChange={() => {}}
      {...overrides}
    />
  );
}

const slider = () => screen.getByRole<HTMLInputElement>("slider", { name: "kick step 1 gain" });
const wrapper = () => slider().closest<HTMLElement>(".dial")!;
const editField = () => screen.getByRole<HTMLInputElement>("textbox", { name: "kick step 1 gain" });

/** A fixed 36×36 box, so its center sits at the dial's own SVG center (18, 18) for easy angle math. */
function mockCenteredRect() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 36,
    bottom: 36,
    width: 36,
    height: 36,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe("Dial", () => {
  it("mirrors value/min/max/step/disabled onto a native range input, with aria-valuetext", () => {
    render(dial({ value: 7, min: 0, max: 10, step: 1, disabled: false }));

    const input = slider();
    expect(input.value).toBe("7");
    expect(input.min).toBe("0");
    expect(input.max).toBe("10");
    expect(input.step).toBe("1");
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("aria-valuetext")).toBe("7");
  });

  it("passes disabled through and blocks keyboard, drag, and type-to-edit changes", () => {
    const onChange = vi.fn();
    render(dial({ disabled: true, onChange }));

    expect(slider().disabled).toBe(true);

    fireEvent.keyDown(slider(), { key: "ArrowUp" });
    fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 });
    fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 });
    fireEvent.doubleClick(wrapper());

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  describe("keyboard", () => {
    it("ArrowUp/ArrowRight increase by step, ArrowDown/ArrowLeft decrease", () => {
      const onChange = vi.fn();
      render(dial({ value: 5, step: 1, onChange }));

      fireEvent.keyDown(slider(), { key: "ArrowUp" });
      expect(onChange).toHaveBeenLastCalledWith(6);
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      expect(onChange).toHaveBeenLastCalledWith(6);
      fireEvent.keyDown(slider(), { key: "ArrowDown" });
      expect(onChange).toHaveBeenLastCalledWith(4);
      fireEvent.keyDown(slider(), { key: "ArrowLeft" });
      expect(onChange).toHaveBeenLastCalledWith(4);
    });

    it("Home/End jump to min/max", () => {
      const onChange = vi.fn();
      render(dial({ value: 5, min: 0, max: 10, onChange }));

      fireEvent.keyDown(slider(), { key: "Home" });
      expect(onChange).toHaveBeenLastCalledWith(0);
      fireEvent.keyDown(slider(), { key: "End" });
      expect(onChange).toHaveBeenLastCalledWith(10);
    });

    it("does not call onChange past the range's edges", () => {
      const onChange = vi.fn();
      const { rerender } = render(dial({ value: 10, min: 0, max: 10, step: 1, onChange }));

      fireEvent.keyDown(slider(), { key: "ArrowUp" });
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      expect(onChange).not.toHaveBeenCalled();

      rerender(dial({ value: 0, min: 0, max: 10, step: 1, onChange }));
      fireEvent.keyDown(slider(), { key: "ArrowDown" });
      fireEvent.keyDown(slider(), { key: "ArrowLeft" });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("pointer drag (radial)", () => {
    // The mocked rect centers the dial at (18, 18); clientX/clientY below are chosen so each
    // move traces a clean quarter-turn (90°), i.e. a third of the 270° arc, for round numbers.
    it("turns the knob proportionally to the angle traced around its center", () => {
      mockCenteredRect();
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 9, step: 1, onChange }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 }); // -90°
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 }); // 0°: +90° turn
      expect(onChange).toHaveBeenLastCalledWith(3);

      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 18, clientY: 36 }); // 90°: +90° turn
      expect(onChange).toHaveBeenLastCalledWith(6);
    });

    it("keeps turning smoothly across the ±180° seam instead of jumping", () => {
      mockCenteredRect();
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 9, step: 1, onChange }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 }); // -90°
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 }); // 0°   -> 3
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 18, clientY: 36 }); // 90°  -> 6
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 0, clientY: 18 }); // 180° (crosses the seam) -> 9
      expect(onChange).toHaveBeenLastCalledWith(9);
    });

    it("clamps at the edge: a further turn keeps reporting the clamped value, never exceeding it", () => {
      mockCenteredRect();
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 9, step: 1, onChange }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 });
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 }); // -> 3
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 18, clientY: 36 }); // -> 6
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 0, clientY: 18 }); // -> 9 (max)
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 }); // another +90° turn, still clamped

      expect(onChange).toHaveBeenLastCalledWith(9);
    });

    it("rounds to the nearest step", () => {
      mockCenteredRect();
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 9, step: 3, onChange }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 });
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 }); // +90° turn -> 3, exactly on-step

      expect(onChange).toHaveBeenLastCalledWith(3);
    });

    it("stops responding to pointermove once released", () => {
      mockCenteredRect();
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 9, step: 1, onChange }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 });
      fireEvent.pointerUp(wrapper(), { pointerId: 1 });
      onChange.mockClear();
      fireEvent.pointerMove(wrapper(), { pointerId: 1, clientX: 36, clientY: 18 });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("tick marks", () => {
    it("places min/max/default ticks from the same angle mapping used by the indicator, default off-center", () => {
      const { container } = render(dial({ value: 0, min: -24, max: 12, defaultValue: 0 }));

      const transformOf = (name: string) => container.querySelector(`[data-tick="${name}"]`)!.getAttribute("transform");
      expect(transformOf("min")).toBe("rotate(-135 18 18)");
      expect(transformOf("max")).toBe("rotate(135 18 18)");
      expect(transformOf("default")).toBe("rotate(45 18 18)");
    });

    it("places the default tick at the centered angle when the default is the midpoint", () => {
      const { container } = render(dial({ value: 0, min: -11, max: 11, defaultValue: 0 }));

      expect(container.querySelector('[data-tick="default"]')!.getAttribute("transform")).toBe("rotate(0 18 18)");
    });

    it("places 25%, 50% and 75% ticks a quarter of the way along the same angle mapping, whatever the default", () => {
      const { container } = render(dial({ value: 0, min: -24, max: 12, defaultValue: 0 }));

      const transformOf = (name: string) => container.querySelector(`[data-tick="${name}"]`)!.getAttribute("transform");
      expect(transformOf("25")).toBe("rotate(-67.5 18 18)");
      expect(transformOf("50")).toBe("rotate(0 18 18)");
      expect(transformOf("75")).toBe("rotate(67.5 18 18)");
    });

    it("draws only the ticks it is given in place of the quarter ticks", () => {
      const { container } = render(dial({ min: -24, max: 12, defaultValue: 0, ticks: [-12] }));

      expect(container.querySelector('[data-tick="-12"]')!.getAttribute("transform")).toBe("rotate(-45 18 18)");
      for (const quarter of ["25", "50", "75"]) expect(container.querySelector(`[data-tick="${quarter}"]`)).toBeNull();
    });

    it("draws no extra ticks when given an empty list", () => {
      const { container } = render(dial({ ticks: [] }));

      expect(container.querySelectorAll("line[data-tick]")).toHaveLength(3);
    });

    it("draws the quarter ticks shorter than the min, max and default ticks", () => {
      const { container } = render(dial());

      const length = (name: string) => {
        const line = container.querySelector(`[data-tick="${name}"]`)!;
        return Number(line.getAttribute("y2")) - Number(line.getAttribute("y1"));
      };
      for (const quarter of ["25", "50", "75"]) expect(length(quarter)).toBeLessThan(length("min"));
      expect(length("max")).toBe(length("min"));
      expect(length("default")).toBe(length("min"));
    });
  });

  describe("value label visibility", () => {
    it("is hidden until focus or hover reveal it, even though aria-valuetext is always set", () => {
      render(dial({ value: 7, format }));

      expect(screen.queryByText("7")).toBeNull();
      expect(slider().getAttribute("aria-valuetext")).toBe("7");

      fireEvent.focus(slider());
      expect(screen.getByText("7")).toBeTruthy();
      fireEvent.blur(slider());
      expect(screen.queryByText("7")).toBeNull();

      fireEvent.mouseEnter(wrapper());
      expect(screen.getByText("7")).toBeTruthy();
      fireEvent.mouseLeave(wrapper());
      expect(screen.queryByText("7")).toBeNull();
    });

    it("reveals the label while dragging; focus gained from the drag keeps it visible until blur", () => {
      render(dial({ value: 7, format }));

      fireEvent.pointerDown(wrapper(), { pointerId: 1, clientX: 18, clientY: 0 });
      expect(screen.getByText("7")).toBeTruthy();
      fireEvent.pointerUp(wrapper(), { pointerId: 1 });
      expect(screen.getByText("7")).toBeTruthy();
      fireEvent.blur(slider());
      expect(screen.queryByText("7")).toBeNull();
    });

    it("never reveals the label while disabled", () => {
      render(dial({ value: 7, disabled: true, format }));

      fireEvent.focus(slider());
      expect(screen.queryByText("7")).toBeNull();
    });
  });

  describe("precise value entry", () => {
    it("double-click opens an editable field prefilled with the current raw value", () => {
      render(dial({ value: 5.5 }));

      fireEvent.doubleClick(wrapper());

      expect(editField().value).toBe("5.5");
    });

    it("Enter on the (keyboard-focused) dial itself also opens the editable field", () => {
      render(dial({ value: 5 }));

      fireEvent.keyDown(slider(), { key: "Enter" });

      expect(editField().value).toBe("5");
    });

    it("commits a typed value on Enter, rounded and clamped to the range, then closes the field", () => {
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 10, step: 1, onChange }));

      fireEvent.doubleClick(wrapper());
      fireEvent.change(editField(), { target: { value: "97" } });
      fireEvent.keyDown(editField(), { key: "Enter" });

      expect(onChange).toHaveBeenCalledExactlyOnceWith(10);
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("commits on blur, same as Enter", () => {
      const onChange = vi.fn();
      render(dial({ value: 0, min: 0, max: 10, step: 1, onChange }));

      fireEvent.doubleClick(wrapper());
      fireEvent.change(editField(), { target: { value: "4" } });
      fireEvent.blur(editField());

      expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("cancels on Escape without calling onChange, and does not commit on the resulting blur", () => {
      const onChange = vi.fn();
      render(dial({ value: 5, onChange }));

      fireEvent.doubleClick(wrapper());
      fireEvent.change(editField(), { target: { value: "9" } });
      fireEvent.keyDown(editField(), { key: "Escape" });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("ignores non-numeric input on commit, without calling onChange", () => {
      const onChange = vi.fn();
      render(dial({ value: 5, onChange }));

      fireEvent.doubleClick(wrapper());
      fireEvent.change(editField(), { target: { value: "abc" } });
      fireEvent.keyDown(editField(), { key: "Enter" });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("does not reopen or reveal a value label while editing", () => {
      render(dial({ value: 5 }));

      fireEvent.doubleClick(wrapper());
      fireEvent.mouseEnter(wrapper());

      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(screen.queryByText("5", { selector: ".dial-value" })).toBeNull();
    });
  });
});

describe("Dial theme", () => {
  it("uses the theme tooltip for the value label", () => {
    render(dial({ value: 7 }));
    fireEvent.focus(slider());
    expect(screen.getByText("7").classList.contains("topcoat-tooltip")).toBe(true);
  });
});
