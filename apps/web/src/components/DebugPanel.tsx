import type { RealtimeEvent, MicDebugInfo } from "../hooks/useRealtime.js";

interface Props {
  events: RealtimeEvent[];
  micDebug?: MicDebugInfo;
}

export function DebugPanel({ events, micDebug }: Props) {
  if (events.length === 0 && !micDebug?.micActive) return null;

  return (
    <div className="debug-panel">
      {micDebug && (
        <div style={{ marginBottom: "0.25rem", color: micDebug.micActive ? "#22c55e" : "#64748b" }}>
          mic: {micDebug.micActive ? "ON" : "off"}
          {micDebug.sampleRate != null && ` | ${micDebug.sampleRate} Hz`}
          {" | chunks: "}
          {micDebug.chunksSent}
        </div>
      )}
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
