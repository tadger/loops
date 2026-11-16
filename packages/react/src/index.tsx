import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createTransport } from "@loops/core";
import type { Clock, Loop, NoteEvent, Timer, Transport, TransportOptions, TransportSnapshot } from "@loops/core";

export type TransportProviderProps = { loop?: Loop; children: ReactNode } & (
  | { transport: Transport; clock?: never; timer?: never; options?: never }
  | { clock: Clock; timer: Timer; options?: Omit<TransportOptions, "clock" | "timer">; transport?: never }
);

const TransportContext = createContext<Transport | null>(null);

interface Owned {
  transport: Transport;
  clock: Clock;
  timer: Timer;
  disposed: boolean;
}

function useLiveTransport(props: TransportProviderProps): Transport {
  const ownedRef = useRef<Owned | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  let owned: Owned | null = null;
  let transport: Transport;
  if (props.transport !== undefined) {
    transport = props.transport;
  } else {
    const { clock, timer, options } = props;
    owned = ownedRef.current;
    // dispose() is terminal, so a live transport is created in render whenever there is none for this
    // clock/timer (first render, after StrictMode's simulated unmount, after a prop switch). `options` is read only here.
    if (owned === null || owned.disposed || owned.clock !== clock || owned.timer !== timer) {
      owned = { transport: createTransport({ ...options, clock, timer }), clock, timer, disposed: false };
      ownedRef.current = owned;
    }
    transport = owned.transport;
  }

  useEffect(() => {
    if (owned === null) return;
    // StrictMode remounted this effect after disposing; re-render to create a live one.
    if (owned.disposed) return rerender();
    return () => {
      owned.disposed = true;
      owned.transport.dispose();
    };
  }, [owned]);

  return transport;
}

export function TransportProvider(props: TransportProviderProps): ReactNode {
  const transport = useLiveTransport(props);
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
