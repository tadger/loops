import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createTransport } from "@loops/core";
import type { Clock, Loop, NoteEvent, Timer, Transport, TransportOptions, TransportSnapshot } from "@loops/core";

export type TransportProviderProps = { loop?: Loop; children: ReactNode } & (
  | { transport: Transport; clock?: never; timer?: never; options?: never }
  | { clock: Clock; timer: Timer; options?: Omit<TransportOptions, "clock" | "timer">; transport?: never }
);

const TransportContext = createContext<Transport | null>(null);

/** Owned transports this module has disposed. */
const disposed = new WeakSet<Transport>();

function useOwnedTransport(
  clock: Clock | undefined,
  timer: Timer | undefined,
  options: Omit<TransportOptions, "clock" | "timer"> | undefined,
): Transport | null {
  const create = () => (clock && timer ? createTransport({ ...options, clock, timer }) : null);
  const [owned, setOwned] = useState(create);

  useEffect(() => {
    if (!clock || !timer) return;
    // dispose() is terminal, so after StrictMode's simulated unmount (or a clock/timer change)
    // replace the transport; the re-render's effect then owns the new one.
    if (owned === null || disposed.has(owned)) {
      setOwned(create());
      return;
    }
    return () => {
      disposed.add(owned);
      owned.dispose();
    };
  }, [owned, clock, timer]);

  return clock && timer ? owned : null;
}

export function TransportProvider(props: TransportProviderProps): ReactNode {
  const owned = useOwnedTransport(props.clock, props.timer, props.options);
  const transport = props.transport ?? owned!;
  const { loop } = props;

  useEffect(() => {
    if (loop !== undefined) transport.setLoop(loop);
  }, [transport, loop]);

  return <TransportContext.Provider value={transport}>{props.children}</TransportContext.Provider>;
}

export function useTransport(): Transport {
  const transport = useContext(TransportContext);
  if (transport === null) throw new Error("useTransport must be used inside a <TransportProvider>");
  return transport;
}

// The selector must return a referentially stable value (e.g. a field, not a new object) or React re-renders forever.
export function useTransportState<T>(selector: (s: TransportSnapshot) => T): T {
  const transport = useTransport();
  const subscribe = useCallback((listener: () => void) => transport.subscribe(listener), [transport]);
  const getSnapshot = () => selector(transport.getSnapshot());
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function useChannel(id: string, handler: (e: NoteEvent) => void): void {
  const transport = useTransport();
  const latest = useLatest(handler);
  useEffect(() => transport.channel(id, (e) => latest.current(e)), [transport, id]);
}

export function usePlayhead(onFrame: (position: { tick: number } | null) => void): void {
  const transport = useTransport();
  const latest = useLatest(onFrame);
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      latest.current(transport.getPosition());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [transport]);
}
