import type { RealtimeEvent } from "../hooks/useRealtime.js";

interface Props {
  events: RealtimeEvent[];
}

export function DebugPanel({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="debug-panel">
      <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
        Debug Events ({events.length})
      </div>
      {events
        .slice()
        .reverse()
        .map((e, i) => (
          <div key={i} className="event">
            {new Date(e.timestamp).toLocaleTimeString()} — {e.type}
          </div>
        ))}
    </div>
  );
}
