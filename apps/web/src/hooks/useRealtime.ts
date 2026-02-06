import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptMessage } from "@ai-tutor/shared";

export interface RealtimeEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export interface UseRealtimeOptions {
  scenarioId: string;
  userId: string;
}

export interface UseRealtimeReturn {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Transcript messages extracted from events */
  transcript: TranscriptMessage[];
  /** Last N raw events for debugging */
  recentEvents: RealtimeEvent[];
  /** Connect to the WebSocket */
  connect: () => void;
  /** Disconnect from the WebSocket */
  disconnect: () => void;
  /** Send a raw JSON event to the server */
  sendEvent: (event: Record<string, unknown>) => void;
}

const MAX_DEBUG_EVENTS = 50;

/**
 * Hook that manages the WebSocket connection to the AI Tutor realtime backend.
 *
 * Currently handles text transcript events. Audio streaming will be added later.
 */
export function useRealtime({
  scenarioId,
  userId,
}: UseRealtimeOptions): UseRealtimeReturn {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef<TranscriptMessage[]>([]);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const addEvent = useCallback((event: RealtimeEvent) => {
    setRecentEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_DEBUG_EVENTS ? next.slice(-MAX_DEBUG_EVENTS) : next;
    });
  }, []);

  const handleMessage = useCallback(
    (data: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }

      const realtimeEvent: RealtimeEvent = {
        ...event,
        type: (event.type as string) || "unknown",
        timestamp: Date.now(),
      };
      addEvent(realtimeEvent);

      // Extract transcript from text events
      // The OpenAI Realtime API sends transcript deltas and done events
      switch (event.type) {
        // Assistant text transcript (complete)
        case "response.audio_transcript.done": {
          const text = event.transcript as string;
          if (text) {
            const msg: TranscriptMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              text,
              timestamp: Date.now(),
            };
            setTranscript((prev) => [...prev, msg]);
          }
          break;
        }

        // User speech transcript (complete)
        case "conversation.item.input_audio_transcription.completed": {
          const text = event.transcript as string;
          if (text) {
            const msg: TranscriptMessage = {
              id: `user-${Date.now()}`,
              role: "user",
              text,
              timestamp: Date.now(),
            };
            setTranscript((prev) => [...prev, msg]);
          }
          break;
        }

        // TODO: Handle delta events for streaming text display
        // TODO: Handle audio events for playback
      }
    },
    [addEvent],
  );

  const connect = useCallback(() => {
    if (wsRef.current) return;

    // Build WebSocket URL (relative — Vite proxy will route to worker)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?scenario=${encodeURIComponent(scenarioId)}&user=${encodeURIComponent(userId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addEvent({ type: "connection.open", timestamp: Date.now() });
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleMessage(event.data);
      }
    };

    ws.onclose = (event) => {
      setConnected(false);
      wsRef.current = null;
      addEvent({
        type: "connection.close",
        code: event.code,
        reason: event.reason,
        timestamp: Date.now(),
      });
    };

    ws.onerror = () => {
      addEvent({ type: "connection.error", timestamp: Date.now() });
    };
  }, [scenarioId, userId, handleMessage, addEvent]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
      setConnected(false);
    }
  }, []);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, []);

  return {
    connected,
    transcript,
    recentEvents,
    connect,
    disconnect,
    sendEvent,
  };
}
