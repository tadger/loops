import { describe, expect, it, vi } from "vitest";
import { createMasterBus } from "../src/audio";

const param = (value = 0) => ({ value });

describe("createMasterBus", () => {
  it("creates a compressor with the master settings and routes it to the destination once", () => {
    const compressor = {
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect: vi.fn(),
    };
    const destination = {} as AudioDestinationNode;
    const ctx = { createDynamicsCompressor: () => compressor as unknown as DynamicsCompressorNode, destination };

    const bus = createMasterBus(ctx) as unknown as typeof compressor;

    expect(bus).toBe(compressor);
    expect([bus.threshold.value, bus.knee.value, bus.ratio.value, bus.attack.value, bus.release.value]).toEqual([
      -15, 30, 12, 0, 0.25,
    ]);
    expect(compressor.connect).toHaveBeenCalledTimes(1);
    expect(compressor.connect).toHaveBeenCalledWith(destination);
  });
});
