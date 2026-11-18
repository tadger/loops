// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteEvent, Transport, TransportSnapshot } from "@loops/core";
import { TransportProvider } from "@loops/react";
import { ChannelPlayer } from "../src/ChannelPlayer";
import type { Audio } from "../src/audio";

vi.mock("../src/samples", () => ({ playSample: vi.fn() }));
import { playSample } from "../src/samples";

afterEach(cleanup);

function fakeTransport() {
  const handlers = new Map<string, (e: NoteEvent) => void>();
  const snapshot: TransportSnapshot = { status: "stopped", loop: null };
  const transport: Transport = {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    getPosition: () => null,
    setLoop: () => {},
    start: () => {},
    pause: () => {},
    stop: () => {},
    dispose: () => {},
    channel: (id, handler) => {
      handlers.set(id, handler);
      return () => handlers.delete(id);
    },
  };
  return { transport, emit: (id: string, e: NoteEvent) => handlers.get(id)?.(e) };
}

function audioWith(samples: Record<string, AudioBuffer>): Audio {
  return { ctx: {} as AudioContext, samples, clock: { now: () => 0 }, timer: { every: () => () => {} }, output: {} as AudioNode };
}

const note: NoteEvent = { channel: "kick", note: { at: 0 }, time: 0, tick: 0, late: false };
const buffer = {} as AudioBuffer;

describe("ChannelPlayer", () => {
  it("plays a sample for a note event on its channel when not muted", () => {
    const { transport, emit } = fakeTransport();
    render(
      <TransportProvider transport={transport}>
        <ChannelPlayer channel="kick" audio={audioWith({ kick: buffer })} muted={false} />
      </TransportProvider>,
    );

    emit("kick", note);

    expect(playSample).toHaveBeenCalledOnce();
  });

  it("does not call playSample when muted", () => {
    const { transport, emit } = fakeTransport();
    render(
      <TransportProvider transport={transport}>
        <ChannelPlayer channel="kick" audio={audioWith({ kick: buffer })} muted={true} />
      </TransportProvider>,
    );

    emit("kick", note);

    expect(playSample).not.toHaveBeenCalled();
  });

  it("does not throw and does not play when audio is null", () => {
    const { transport, emit } = fakeTransport();
    render(
      <TransportProvider transport={transport}>
        <ChannelPlayer channel="kick" audio={null} muted={false} />
      </TransportProvider>,
    );

    expect(() => emit("kick", note)).not.toThrow();
    expect(playSample).not.toHaveBeenCalled();
  });

  it("does not play when the channel has no sample buffer loaded", () => {
    const { transport, emit } = fakeTransport();
    render(
      <TransportProvider transport={transport}>
        <ChannelPlayer channel="kick" audio={audioWith({})} muted={false} />
      </TransportProvider>,
    );

    emit("kick", note);

    expect(playSample).not.toHaveBeenCalled();
  });
});
