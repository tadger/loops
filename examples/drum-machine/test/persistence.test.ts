import { serializeLoop } from "@loops/core";
import type { Loop } from "@loops/core";
import { describe, expect, it } from "vitest";
import { testLoop } from "./fixtures";
import {
  exportLoop,
  importLoop,
  loadLoop,
  loadMutes,
  MUTE_STORAGE_KEY,
  saveLoop,
  saveMutes,
  STORAGE_KEY,
} from "../src/persistence";
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
    const loop = testLoop();
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
    const stored = JSON.stringify({ ...testLoop(), tempo: 0 });
    const result = loadLoop(memoryStore({ [STORAGE_KEY]: stored }));
    expect(result).toMatchObject({ ok: false, errors: [{ path: "tempo" }] });
  });
});

describe("STORAGE_KEY", () => {
  it("is the v2 key, so a loop saved under the old kit's key is not loaded", () => {
    expect(STORAGE_KEY).toBe("loops-demo:loop:v2");
    const old = JSON.stringify(serializeLoop(testLoop()));
    expect(loadLoop(memoryStore({ "loops-demo:loop": old }))).toBeNull();
  });
});

describe("saveMutes / loadMutes", () => {
  it("round-trips a set of muted channels", () => {
    const store = memoryStore();
    saveMutes(store, new Set(["kick", "snare"]));
    expect(JSON.parse(store.data[MUTE_STORAGE_KEY]!).sort()).toEqual(["kick", "snare"]);
    expect(loadMutes(store)).toEqual(new Set(["kick", "snare"]));
  });

  it("returns an empty set when nothing is stored", () => {
    expect(loadMutes(memoryStore())).toEqual(new Set());
  });

  it("returns an empty set for corrupt stored text", () => {
    expect(loadMutes(memoryStore({ [MUTE_STORAGE_KEY]: "{nope" }))).toEqual(new Set());
  });

  it("drops ids that are not in the kit", () => {
    const store = memoryStore({ [MUTE_STORAGE_KEY]: JSON.stringify(["kick", "cowbell", "nonsense"]) });
    expect(loadMutes(store)).toEqual(new Set(["kick"]));
  });
});

describe("exportLoop / importLoop", () => {
  it("re-imports an export as the canonical loop", () => {
    const loop = testLoop();
    expect(importLoop(exportLoop(loop))).toEqual({ ok: true, loop: serializeLoop(loop) });
  });

  it("pretty-prints", () => {
    expect(exportLoop(testLoop())).toContain("\n");
  });

  it("reports text that is not JSON", () => {
    expect(importLoop("{nope")).toEqual({
      ok: false,
      errors: [{ path: "", message: expect.stringContaining("JSON") }],
    });
  });

  it("surfaces the path of an invalid field", () => {
    const bad: Loop = { ...testLoop(), tempo: 0 };
    expect(importLoop(JSON.stringify(bad))).toMatchObject({ ok: false, errors: [{ path: "tempo" }] });
  });
});
