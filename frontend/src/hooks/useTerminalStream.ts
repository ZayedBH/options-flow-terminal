import { useEffect, useRef, useState } from "react";
import { fetchSnapshots, wsUrl } from "../api/client";
import type { FlowEvent, TerminalSnapshot } from "../types";

interface StreamMessage {
  type: "initial" | "snapshot" | "flow";
  snapshots?: TerminalSnapshot[];
  data?: TerminalSnapshot | FlowEvent[];
}

interface TerminalState {
  snapshots: Record<string, TerminalSnapshot>;
  flow: Record<string, FlowEvent[]>;
  connected: boolean;
  lastUpdate: string | null;
  error: string | null;
}

const MAX_FLOW_PER_SYMBOL = 200;

export function useTerminalStream(): TerminalState {
  const [state, setState] = useState<TerminalState>({
    snapshots: {},
    flow: {},
    connected: false,
    lastUpdate: null,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const seed = async () => {
      try {
        const snaps = await fetchSnapshots();
        if (cancelled) return;
        setState((s) => ({
          ...s,
          snapshots: Object.fromEntries(snaps.map((sn) => [sn.underlying, sn])),
          lastUpdate: new Date().toISOString(),
        }));
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({ ...s, error: (e as Error).message }));
        }
      }
    };

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setState((s) => ({ ...s, connected: true, error: null }));
      };
      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        // Try to reconnect after 3 seconds
        if (!cancelled) {
          reconnectRef.current = window.setTimeout(connect, 3000);
        }
      };
      ws.onerror = () => {
        setState((s) => ({ ...s, error: "websocket error" }));
      };
      ws.onmessage = (event) => {
        try {
          const msg: StreamMessage = JSON.parse(event.data);
          if (msg.type === "initial" && msg.snapshots) {
            setState((s) => ({
              ...s,
              snapshots: Object.fromEntries(
                msg.snapshots!.map((sn) => [sn.underlying, sn])
              ),
              lastUpdate: new Date().toISOString(),
            }));
          } else if (msg.type === "snapshot" && msg.data) {
            const snap = msg.data as TerminalSnapshot;
            setState((s) => ({
              ...s,
              snapshots: { ...s.snapshots, [snap.underlying]: snap },
              lastUpdate: new Date().toISOString(),
            }));
          } else if (msg.type === "flow" && Array.isArray(msg.data)) {
            const events = msg.data as FlowEvent[];
            setState((s) => {
              const next = { ...s.flow };
              for (const e of events) {
                const prev = next[e.underlying] ?? [];
                next[e.underlying] = [e, ...prev].slice(0, MAX_FLOW_PER_SYMBOL);
              }
              return { ...s, flow: next, lastUpdate: new Date().toISOString() };
            });
          }
        } catch (err) {
          console.error("ws message parse failed", err);
        }
      };
    };

    seed();
    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, []);

  return state;
}
