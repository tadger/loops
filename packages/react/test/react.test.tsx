// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransport } from "@loops/core";
import type { Loop, NoteEvent, Transport } from "@loops/core";
import { createFakeEnv } from "@loops/core/testing";
import type { FakeEnv } from "@loops/core/testing";
import { TransportProvider, useChannel, usePlayhead, useTransport, useTransportState } from "../src/index";

// Every transport records its own disposal, so tests can tell whether a render saw a disposed one.
const { disposedTransports } = vi.hoisted(() => ({ disposedTransports: new WeakSet<object>() }));
vi.mock("@loops/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@loops/core")>();
  return {
    ...core,
    createTransport: (options: Parameters<typeof core.createTransport>[0]) => {
      const transport = core.createTransport(options);
      const dispose = transport.dispose;
      transport.dispose = () => {
        disposedTransports.add(transport);
        dispose();
      };
      return transport;
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeLoop(tempo = 120): Loop {
  return { version: 1, bars: 1, beatsPerBar: 4, tempo, channels: { kick: [{ at: 0 }] } };
}

function makeExternal(): { env: FakeEnv; transport: Transport } {
  const env = createFakeEnv();
  return { env, transport: createTransport({ clock: env.clock, timer: env.timer }) };
}

/** A consumer that records every transport it renders with, whether it was disposed then, and kick events. */
function makeProbe() {
  const seen: Transport[] = [];
  const disposedAtRender: Transport[] = [];
  const events: NoteEvent[] = [];
  function Probe() {
    const transport = useTransport();
    seen.push(transport);
    if (disposedTransports.has(transport)) disposedAtRender.push(transport);
    useChannel("kick", (e) => events.push(e));
    return null;
  }
  return { Probe, seen, disposedAtRender, events, current: () => seen.at(-1)! };
}

describe("TransportProvider with an owned transport", () => {
  it("disposes the transport on unmount", () => {
    const env = createFakeEnv();
    let transport: Transport | undefined;
    function Probe() {
      transport = useTransport();
      return null;
    }
    const { unmount } = render(
      <TransportProvider clock={env.clock} timer={env.timer} loop={makeLoop()}>
        <Probe />
      </TransportProvider>,
    );
    const dispose = vi.spyOn(transport!, "dispose");
    act(() => transport!.start());
    expect(env.timer.activeCount).toBe(1);

    unmount();

    expect(dispose).toHaveBeenCalled();
    expect(env.timer.activeCount).toBe(0);
  });

  it("leaves a live transport after StrictMode's simulated unmount and cleans up on the final one", () => {
    const env = createFakeEnv();
    const events: NoteEvent[] = [];
    let transport: Transport | undefined;
    const disposedAtRender: Transport[] = [];
    function Probe() {
      transport = useTransport();
      if (disposedTransports.has(transport)) disposedAtRender.push(transport);
      useChannel("kick", (e) => events.push(e));
      return <span data-testid="status">{useTransportState((s) => s.status)}</span>;
    }
    const { unmount } = render(
      <StrictMode>
        <TransportProvider clock={env.clock} timer={env.timer} loop={makeLoop()}>
          <Probe />
        </TransportProvider>
      </StrictMode>,
    );

    act(() => transport!.start());
    act(() => env.run(0.5));

    expect(screen.getByTestId("status").textContent).toBe("playing");
    expect(events.map((e) => e.tick)).toEqual([0]);
    expect(disposedAtRender).toEqual([]);
    expect(env.timer.activeCount).toBe(1);

    unmount();

    expect(env.timer.activeCount).toBe(0);
  });
});

describe("TransportProvider with an external transport", () => {
  it("never disposes it on unmount", () => {
    const { transport } = makeExternal();
    const dispose = vi.spyOn(transport, "dispose");
    const { unmount } = render(
      <TransportProvider transport={transport}>
        <span />
      </TransportProvider>,
    );

    unmount();

    expect(dispose).not.toHaveBeenCalled();
  });

  it("rebinds consumers when the transport prop changes", () => {
    const a = makeExternal();
    const b = makeExternal();
    a.transport.setLoop(makeLoop());
    b.transport.setLoop(makeLoop());
    const disposeA = vi.spyOn(a.transport, "dispose");
    const events: NoteEvent[] = [];
    let seen: Transport | undefined;
    function Probe() {
      seen = useTransport();
      useChannel("kick", (e) => events.push(e));
      return null;
    }
    const { rerender, unmount } = render(
      <TransportProvider transport={a.transport}>
        <Probe />
      </TransportProvider>,
    );
    expect(seen).toBe(a.transport);

    rerender(
      <TransportProvider transport={b.transport}>
        <Probe />
      </TransportProvider>,
    );
    expect(seen).toBe(b.transport);

    act(() => a.transport.start());
    act(() => a.env.run(0.5));
    expect(events).toHaveLength(0);

    act(() => b.transport.start());
    act(() => b.env.run(0.5));
    expect(events).toHaveLength(1);

    unmount();
    expect(disposeA).not.toHaveBeenCalled();
  });
});

describe("TransportProvider switching props", () => {
  it("switches from an external transport to an owned one", () => {
    const external = makeExternal();
    const env = createFakeEnv();
    const loop = makeLoop();
    const probe = makeProbe();
    const { rerender } = render(
      <TransportProvider transport={external.transport} loop={loop}>
        <probe.Probe />
      </TransportProvider>,
    );

    rerender(
      <TransportProvider clock={env.clock} timer={env.timer} loop={loop}>
        <probe.Probe />
      </TransportProvider>,
    );

    const owned = probe.current();
    expect(owned).not.toBe(external.transport);
    expect(probe.disposedAtRender).toEqual([]);
    expect(disposedTransports.has(external.transport)).toBe(false);
    act(() => owned.start());
    act(() => env.run(0.5));
    expect(probe.events).toHaveLength(1);
  });

  it("switches from an owned transport to an external one, disposing the owned one", () => {
    const external = makeExternal();
    const env = createFakeEnv();
    const loop = makeLoop();
    const probe = makeProbe();
    const { rerender } = render(
      <TransportProvider clock={env.clock} timer={env.timer} loop={loop}>
        <probe.Probe />
      </TransportProvider>,
    );
    const owned = probe.current();

    rerender(
      <TransportProvider transport={external.transport} loop={loop}>
        <probe.Probe />
      </TransportProvider>,
    );

    expect(disposedTransports.has(owned)).toBe(true);
    expect(probe.current()).toBe(external.transport);
    act(() => external.transport.start());
    act(() => external.env.run(0.5));
    expect(probe.events).toHaveLength(1);
  });

  it("switches owned → external → owned without exposing a disposed transport", () => {
    const external = makeExternal();
    const env = createFakeEnv();
    const loop = makeLoop();
    const probe = makeProbe();
    const owned = () => (
      <TransportProvider clock={env.clock} timer={env.timer} loop={loop}>
        <probe.Probe />
      </TransportProvider>
    );
    const { rerender, unmount } = render(owned());
    const first = probe.current();
    rerender(
      <TransportProvider transport={external.transport} loop={loop}>
        <probe.Probe />
      </TransportProvider>,
    );

    rerender(owned());

    const second = probe.current();
    expect(second).not.toBe(first);
    expect(second).not.toBe(external.transport);
    expect(probe.disposedAtRender).toEqual([]);
    act(() => second.start());
    act(() => env.run(0.5));
    expect(probe.events).toHaveLength(1);

    unmount();
    expect(env.timer.activeCount).toBe(0);
  });

  it("replaces the owned transport when clock and timer change", () => {
    const envA = createFakeEnv();
    const envB = createFakeEnv();
    const loop = makeLoop();
    const probe = makeProbe();
    const view = (env: FakeEnv) => (
      <TransportProvider clock={env.clock} timer={env.timer} loop={loop}>
        <probe.Probe />
      </TransportProvider>
    );
    const { rerender } = render(view(envA));
    const first = probe.current();
    act(() => first.start());
    expect(envA.timer.activeCount).toBe(1);

    rerender(view(envB));

    const second = probe.current();
    expect(second).not.toBe(first);
    expect(disposedTransports.has(first)).toBe(true);
    expect(envA.timer.activeCount).toBe(0);
    expect(probe.disposedAtRender).toEqual([]);
    probe.events.length = 0; // first.start() already emitted tick 0
    act(() => second.start());
    act(() => envB.run(0.5));
    expect(probe.events).toHaveLength(1);
  });
});

describe("loop prop", () => {
  it("calls setLoop only when the loop changes, and may arrive after mount", () => {
    const { transport } = makeExternal();
    const setLoop = vi.spyOn(transport, "setLoop");
    const first = makeLoop(120);
    const second = makeLoop(90);
    const view = (loop: Loop | undefined, label: string) => (
      <TransportProvider transport={transport} loop={loop}>
        <span>{label}</span>
      </TransportProvider>
    );

    const { rerender } = render(view(undefined, "a"));
    expect(setLoop).not.toHaveBeenCalled();

    rerender(view(first, "b"));
    expect(setLoop).toHaveBeenCalledTimes(1);
    expect(setLoop).toHaveBeenLastCalledWith(first);

    rerender(view(first, "c"));
    expect(setLoop).toHaveBeenCalledTimes(1);

    rerender(view(second, "d"));
    expect(setLoop).toHaveBeenCalledTimes(2);
    expect(setLoop).toHaveBeenLastCalledWith(second);
  });
});

describe("useTransport", () => {
  it("throws outside a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useTransport();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/TransportProvider/);
  });
});

describe("useTransportState", () => {
  it("re-renders when the selected value changes, not when only the loop changes", () => {
    const { transport } = makeExternal();
    let renders = 0;
    function Status() {
      renders++;
      return <span data-testid="status">{useTransportState((s) => s.status)}</span>;
    }
    render(
      <TransportProvider transport={transport}>
        <Status />
      </TransportProvider>,
    );
    expect(renders).toBe(1);
    expect(screen.getByTestId("status").textContent).toBe("stopped");

    act(() => transport.setLoop(makeLoop()));
    expect(renders).toBe(1);

    act(() => transport.start());
    expect(renders).toBe(2);
    expect(screen.getByTestId("status").textContent).toBe("playing");
  });
});

describe("useChannel", () => {
  it("registers once despite new inline closures, uses the latest one, and unregisters on unmount", () => {
    const { env, transport } = makeExternal();
    transport.setLoop(makeLoop());
    const channel = vi.spyOn(transport, "channel");
    const handled: string[] = [];
    function Listener({ label }: { label: string }) {
      useChannel("kick", () => handled.push(label));
      return null;
    }
    const view = (label: string) => (
      <TransportProvider transport={transport}>
        <Listener label={label} />
      </TransportProvider>
    );

    const { rerender, unmount } = render(view("first"));
    rerender(view("second"));
    rerender(view("third"));
    expect(channel).toHaveBeenCalledTimes(1);

    act(() => transport.start());
    act(() => env.run(0.5));
    expect(handled).toEqual(["third"]);

    unmount();
    act(() => env.run(4));
    expect(handled).toEqual(["third"]);
  });
});

describe("usePlayhead", () => {
  function stubAnimationFrames() {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const cancel = vi.fn((id: number) => void pending.delete(id));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pending.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const frame = () => {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb(0);
    };
    return { frame, cancel, pending };
  }

  it("calls the latest onFrame each frame with getPosition() and cancels on unmount", () => {
    const { frame, cancel, pending } = stubAnimationFrames();
    const { env, transport } = makeExternal();
    transport.setLoop(makeLoop());
    transport.start();
    const calls: [string, { tick: number } | null][] = [];
    function Playhead({ label }: { label: string }) {
      usePlayhead((position) => calls.push([label, position]));
      return null;
    }
    const view = (label: string) => (
      <TransportProvider transport={transport}>
        <Playhead label={label} />
      </TransportProvider>
    );

    const { rerender, unmount } = render(view("first"));
    env.clock.advance(0.3);
    frame();
    expect(calls).toEqual([["first", transport.getPosition()]]);

    env.clock.advance(0.2);
    frame();
    expect(calls[1]).toEqual(["first", transport.getPosition()]);
    expect(calls[1]![1]!.tick).toBeGreaterThan(calls[0]![1]!.tick);

    rerender(view("second"));
    frame();
    expect(calls[2]).toEqual(["second", transport.getPosition()]);

    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(pending.size).toBe(0);
    frame();
    expect(calls).toHaveLength(3);
  });
});
