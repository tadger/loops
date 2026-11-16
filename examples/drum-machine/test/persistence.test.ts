import { serializeLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { createInitialLoop } from "../src/loop-state";
import { exportLoop, importLoop, loadLoop, saveLoop, STORAGE_KEY } from "../src/persistence";
import type { KeyValueStore } from "../src/persistence";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
  };
}

describe("saveLoop / loadLoop", () => {
  it("round-trips the canonical JSON", () => {
    const store = memoryStore();
    const loop = createInitialLoop();
    saveLoop(store, loop);
    expect(JSON.parse(store.data[STORAGE_KEY]!)).toEqual(serializeLoop(loop));
    expect(loadLoop(store)).toEqual({ ok: true, loop: serializeLoop(loop) });
  });

  it("returns null when nothing is stored", () => {
    expect(loadLoop(memoryStore())).toBeNull();
  });

  it("reports corrupt stored text", () => {
    const result = loadLoop(memoryStore({ [STORAGE_KEY]: "{nope" }));
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    if (!result!.ok) expect(result!.errors[0]!.message).toContain("JSON");
  });

  it("reports a stored loop that no longer validates", () => {
    const stored = JSON.stringify({ ...createInitialLoop(), tempo: 0 });
    const result = loadLoop(memoryStore({ [STORAGE_KEY]: stored }));
    expect(result).toMatchObject({ ok: false, errors: [{ path: "tempo" }] });
  });
});

describe("exportLoop / importLoop", () => {
  it("re-imports an export as the canonical loop", () => {
    const loop = createInitialLoop();
    expect(importLoop(exportLoop(loop))).toEqual({ ok: true, loop: serializeLoop(loop) });
  });

  it("pretty-prints", () => {
    expect(exportLoop(createInitialLoop())).toContain("\n");
  });

  it("reports text that is not JSON", () => {
    expect(importLoop("{nope")).toEqual({
      ok: false,
      errors: [{ path: "", message: expect.stringContaining("JSON") }],
    });
  });

  it("surfaces the path of an invalid field", () => {
    const bad: Loop = { ...createInitialLoop(), tempo: 0 };
    expect(importLoop(JSON.stringify(bad))).toMatchObject({ ok: false, errors: [{ path: "tempo" }] });
  });
});
