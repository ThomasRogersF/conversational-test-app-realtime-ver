import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRealtime } from "../hooks/useRealtime.js";
import { TranscriptBubble } from "../components/TranscriptBubble.js";
import { DebugPanel } from "../components/DebugPanel.js";

export function CallScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const scenarioId = searchParams.get("scenario") || "";
  // TODO: Replace with real user identity
  const userId = useMemo(
    () => `user-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const {
    connected,
    transcript,
    recentEvents,
    micDebug,
    connect,
    disconnect,
    startMic,
    stopMic,
  } = useRealtime({ scenarioId, userId });

  const handleCallToggle = async () => {
    if (connected) {
      stopMic();
      disconnect();
    } else {
      connect();
      await startMic();
    }
  };

  const handleExit = () => {
    stopMic();
    disconnect();
    navigate("/");
  };

  if (!scenarioId) {
    return (
      <div className="container" style={{ paddingTop: "2rem" }}>
        <p style={{ color: "#ef4444" }}>
          No scenario selected.{" "}
          <a href="/" style={{ color: "#38bdf8" }}>
            Go back
          </a>
        </p>
      </div>
    );
  }

  // Button label & style depend on mic state
  const listening = connected && micDebug.micActive;

  return (
    <div className="call-screen">
      {/* Header */}
      <div className="call-header">
        <button className="exit-btn" onClick={handleExit}>
          Exit
        </button>
        <div className="progress">
          <span
            className={`status-dot ${connected ? "connected" : "disconnected"}`}
          />
          {connected ? "Connected" : "Disconnected"}
          {/* TODO: Add lesson progress indicator */}
        </div>
      </div>

      {/* Transcript */}
      <div className="transcript">
        {transcript.length === 0 && !connected && (
          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              marginTop: "2rem",
            }}
          >
            Press "Start Call" to begin your lesson
          </p>
        )}
        {transcript.length === 0 && connected && (
          <p
            style={{
              textAlign: "center",
              color: "#64748b",
              marginTop: "2rem",
            }}
          >
            Waiting for tutor...
          </p>
        )}
        {transcript.map((msg) => (
          <TranscriptBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Bottom: Call button */}
      <div className="call-bottom">
        <button
          className={`call-btn ${listening ? "listening" : ""} ${connected && !listening ? "connected" : ""}`}
          onClick={handleCallToggle}
        >
          {listening ? "Listening..." : connected ? "End" : "Start Call"}
        </button>
      </div>

      {/* Debug panel (dev only) */}
      <DebugPanel events={recentEvents} micDebug={micDebug} />
    </div>
  );
}
