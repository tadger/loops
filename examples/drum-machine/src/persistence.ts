import { parseLoop, serializeLoop } from "@loops/core";
import type { Loop, ParseLoopResult } from "@loops/core";
import { CHANNELS } from "./loop-state";

export const STORAGE_KEY = "loops-demo:loop:v2";
export const MUTE_STORAGE_KEY = "loops-demo:mutes:v1";

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function exportLoop(loop: Loop): string {
  return JSON.stringify(serializeLoop(loop), null, 2);
}

export function importLoop(text: string): ParseLoopResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: "", message: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return parseLoop(json);
}

export function saveLoop(store: KeyValueStore, loop: Loop): void {
  store.setItem(STORAGE_KEY, JSON.stringify(serializeLoop(loop)));
}

export function loadLoop(store: KeyValueStore): ParseLoopResult | null {
  const text = store.getItem(STORAGE_KEY);
  return text === null ? null : importLoop(text);
}

export function saveMutes(store: KeyValueStore, muted: ReadonlySet<string>): void {
  store.setItem(MUTE_STORAGE_KEY, JSON.stringify([...muted]));
}

/** Playback-only; not part of the Loop, so a bad or stale kit id never surfaces. */
export function loadMutes(store: KeyValueStore): ReadonlySet<string> {
  const text = store.getItem(MUTE_STORAGE_KEY);
  if (text === null) return new Set();
  const kit: readonly string[] = CHANNELS;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && kit.includes(id)));
  } catch {
    return new Set();
  }
}
