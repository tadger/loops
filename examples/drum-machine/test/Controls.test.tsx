// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Controls } from "../src/Controls";

afterEach(cleanup);

type Props = Parameters<typeof Controls>[0];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    status: "stopped",
    loading: false,
    tempo: 100,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onTempo: vi.fn(),
    ...over,
  };
  render(<Controls {...props} />);
  return props;
}

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("Controls", () => {
  it("enables Play and disables Pause and Stop when stopped", () => {
    setup();
    expect(button("Play").disabled).toBe(false);
    expect(button("Pause").disabled).toBe(true);
    expect(button("Stop").disabled).toBe(true);
  });

  it("disables Play and enables Pause and Stop while playing", () => {
    setup({ status: "playing" });
    expect(button("Play").disabled).toBe(true);
    expect(button("Pause").disabled).toBe(false);
    expect(button("Stop").disabled).toBe(false);
  });

  it("enables Play and Stop but not Pause when paused", () => {
    setup({ status: "paused" });
    expect(button("Play").disabled).toBe(false);
    expect(button("Pause").disabled).toBe(true);
    expect(button("Stop").disabled).toBe(false);
  });

  it("shows a disabled Loading… button instead of Play while loading", () => {
    setup({ loading: true });
    expect(button("Loading…").disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("calls onPlay, onPause and onStop", () => {
    const props = setup({ status: "playing" });
    fireEvent.click(button("Pause"));
    fireEvent.click(button("Stop"));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(props.onStop).toHaveBeenCalledTimes(1);
    cleanup();
    const stopped = setup();
    fireEvent.click(button("Play"));
    expect(stopped.onPlay).toHaveBeenCalledTimes(1);
  });

  it("renders a 40-200 tempo slider that reports the new bpm", () => {
    const props = setup({ tempo: 90 });
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("40");
    expect(slider.max).toBe("200");
    expect(slider.value).toBe("90");
    fireEvent.change(slider, { target: { value: "120" } });
    expect(props.onTempo).toHaveBeenCalledWith(120);
  });

  it("shows the tempo in the output", () => {
    setup({ tempo: 133 });
    expect(document.querySelector("output")!.textContent).toBe("133");
  });
});

describe("Controls theme", () => {
  it("styles the transport with the theme", () => {
    setup();
    expect(button("Play").classList.contains("topcoat-button--cta")).toBe(true);
    expect(button("Pause").classList.contains("topcoat-button")).toBe(true);
    expect(button("Stop").classList.contains("topcoat-button")).toBe(true);
    expect(screen.getByRole("slider").classList.contains("topcoat-range")).toBe(true);
  });
});
