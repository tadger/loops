export interface ParamEvent {
  kind: "set" | "ramp";
  value: number;
  time: number;
}

/** A gain node stand-in that records the schedule and evaluates it like an AudioParam would. */
export function fakeGain() {
  const events: ParamEvent[] = [];
  const levelAt = (t: number): number => {
    let prev: ParamEvent | undefined;
    let next: ParamEvent | undefined;
    for (const e of events) {
      if (e.time <= t) prev = e;
      else {
        next = e;
        break;
      }
    }
    if (prev === undefined) return 0;
    if (next === undefined || next.kind === "set") return prev.value;
    return prev.value + ((next.value - prev.value) * (t - prev.time)) / (next.time - prev.time);
  };
  return {
    events,
    levelAt,
    connect: () => {},
    gain: {
      setValueAtTime: (value: number, time: number) => void events.push({ kind: "set", value, time }),
      linearRampToValueAtTime: (value: number, time: number) => void events.push({ kind: "ramp", value, time }),
    },
  };
}
