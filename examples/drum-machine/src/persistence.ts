import { parseLoop, serializeLoop } from "@loops/core";
import type { Loop, ParseLoopResult } from "@loops/core";

export const STORAGE_KEY = "loops-demo:loop";

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
