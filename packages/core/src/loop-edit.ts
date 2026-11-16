import { loopLength, MAX_TEMPO, MIN_TEMPO } from "./loop";
import type { Json, Loop, Note } from "./loop";
import { cloneJson, cloneNote, isPositiveInteger, jsonProblem, validateNote } from "./note";

// Pure helpers: return the same loop when nothing changed, and keep untouched channel arrays by
// reference so UIs can memoize on them. Input loops are assumed valid; arguments are validated.

function hasChannel(loop: Loop, channel: string): boolean {
  return Object.hasOwn(loop.channels, channel);
}

function notesOf(loop: Loop, channel: string): Note[] {
  return hasChannel(loop, channel) ? loop.channels[channel]! : [];
}

function assertChannelId(channel: string): void {
  if (typeof channel !== "string" || channel === "") throw new RangeError("channel id must be a non-empty string");
}

function assertNote(note: unknown, path: string, length: number): void {
  let message: string | undefined;
  validateNote(note, path, length, (p, m) => void (message ??= `${p}: ${m}`));
  if (message !== undefined) throw new RangeError(message);
}

function bySortedAt(notes: Note[]): Note[] {
  return notes.sort((a, b) => a.at - b.at);
}

function withChannel(loop: Loop, channel: string, notes: Note[]): Loop {
  const entries = Object.entries(loop.channels).map(([id, existing]) => [id, id === channel ? notes : existing] as const);
  if (!hasChannel(loop, channel)) entries.push([channel, notes]);
  // fromEntries defines own properties, so a "__proto__" channel stays data.
  return { ...loop, channels: Object.fromEntries(entries) };
}

/** Adds a note at `at`, or removes every note there; `note` supplies `duration`/`data` when adding. */
export function toggleNote(loop: Loop, channel: string, at: number, note?: Omit<Note, "at">): Loop {
  assertChannelId(channel);
  const length = loopLength(loop);
  assertNote({ at }, "note", length);
  const existing = notesOf(loop, channel);
  if (existing.some((n) => n.at === at)) return withChannel(loop, channel, existing.filter((n) => n.at !== at));
  return addNote(loop, channel, { ...note, at });
}

/** Several notes may share an `at`. */
export function addNote(loop: Loop, channel: string, note: Note): Loop {
  assertChannelId(channel);
  assertNote(note, "note", loopLength(loop));
  return withChannel(loop, channel, bySortedAt([...notesOf(loop, channel), cloneNote(note)]));
}

/** Returns `loop` itself if no note is at `at`. */
export function removeNotes(loop: Loop, channel: string, at: number): Loop {
  const existing = notesOf(loop, channel);
  const kept = existing.filter((n) => n.at !== at);
  return kept.length === existing.length ? loop : withChannel(loop, channel, kept);
}

export function setChannel(loop: Loop, channel: string, notes: Note[]): Loop {
  assertChannelId(channel);
  const length = loopLength(loop);
  notes.forEach((note, i) => assertNote(note, `notes[${i}]`, length));
  if (notes.length === 0 && hasChannel(loop, channel) && loop.channels[channel]!.length === 0) return loop;
  return withChannel(loop, channel, bySortedAt(notes.map(cloneNote)));
}

export function clearChannel(loop: Loop, channel: string): Loop {
  return setChannel(loop, channel, []);
}

export function setTempo(loop: Loop, bpm: number): Loop {
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm < MIN_TEMPO || bpm > MAX_TEMPO) {
    throw new RangeError(`tempo must be a number between ${MIN_TEMPO} and ${MAX_TEMPO}`);
  }
  return bpm === loop.tempo ? loop : { ...loop, tempo: bpm };
}

/** Notes that no longer fit are removed and reported in `dropped`, in channel then note order. */
export function resize(
  loop: Loop,
  size: { bars?: number; beatsPerBar?: number },
): { loop: Loop; dropped: Array<{ channel: string; note: Note }> } {
  const bars = size.bars ?? loop.bars;
  const beatsPerBar = size.beatsPerBar ?? loop.beatsPerBar;
  if (!isPositiveInteger(bars)) throw new RangeError("bars must be an integer >= 1");
  if (!isPositiveInteger(beatsPerBar)) throw new RangeError("beatsPerBar must be an integer >= 1");
  const length = loopLength({ bars, beatsPerBar });
  if (!Number.isSafeInteger(length)) throw new RangeError("loop length is out of range");
  if (bars === loop.bars && beatsPerBar === loop.beatsPerBar) return { loop, dropped: [] };

  const dropped: Array<{ channel: string; note: Note }> = [];
  const entries = Object.entries(loop.channels).map(([channel, notes]) => {
    const fits = (n: Note) => n.at < length && n.at + (n.duration ?? 0) <= length;
    if (notes.every(fits)) return [channel, notes] as const;
    for (const note of notes) if (!fits(note)) dropped.push({ channel, note });
    return [channel, notes.filter(fits)] as const;
  });
  return { loop: { ...loop, bars, beatsPerBar, channels: Object.fromEntries(entries) }, dropped };
}

/** `x` is a hit, `-` or `.` a rest, each `stepTicks` long; whitespace and `|` are ignored. */
export function steps(pattern: string, opts: { stepTicks: number; data?: Json }): Note[] {
  const { stepTicks, data } = opts;
  if (!isPositiveInteger(stepTicks)) throw new RangeError("stepTicks must be an integer >= 1");
  if (data !== undefined) {
    const problem = jsonProblem(data);
    if (problem) throw new RangeError(`data: ${problem}`);
  }
  const notes: Note[] = [];
  let step = 0;
  for (const char of pattern) {
    if (/\s/.test(char) || char === "|") continue;
    if (char === "x") {
      const note: Note = { at: step * stepTicks };
      if (data !== undefined) note.data = cloneJson(data);
      notes.push(note);
    } else if (char !== "-" && char !== ".") {
      throw new RangeError(`invalid pattern character ${JSON.stringify(char)}: expected "x", "-", ".", "|" or whitespace`);
    }
    step++;
  }
  return notes;
}
