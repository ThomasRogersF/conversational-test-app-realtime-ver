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

export interface MicDebugInfo {
  micActive: boolean;
  sampleRate: number | null;
  chunksSent: number;
}

export interface UseRealtimeReturn {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Transcript messages extracted from events */
  transcript: TranscriptMessage[];
  /** Last N raw events for debugging */
  recentEvents: RealtimeEvent[];
  /** Mic debug info for DebugPanel */
  micDebug: MicDebugInfo;
  /** Connect to the WebSocket */
  connect: () => void;
  /** Disconnect from the WebSocket */
  disconnect: () => void;
  /** Send a raw JSON event to the server */
  sendEvent: (event: Record<string, unknown>) => void;
  /** Start microphone capture and PCM16 streaming */
  startMic: () => Promise<void>;
  /** Stop microphone capture */
  stopMic: () => void;
}

const MAX_DEBUG_EVENTS = 50;

/** Target chunk size: ~20ms at 24kHz = 480 samples */
const CHUNK_SAMPLES = 480;

/**
 * Convert an Int16Array to a base64 string.
 * Works on the underlying byte buffer without large intermediate strings.
 */
function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  // Build string in 8KB segments to avoid huge single concatenations
  const SEGMENT = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += SEGMENT) {
    const end = Math.min(i + SEGMENT, bytes.length);
    binary += String.fromCharCode(...bytes.subarray(i, end));
  }
  return btoa(binary);
}

/**
 * Hook that manages the WebSocket connection to the AI Tutor realtime backend.
 *
 * Handles text transcript events and microphone PCM16 streaming at 24kHz.
 */
export function useRealtime({
  scenarioId,
  userId,
}: UseRealtimeOptions): UseRealtimeReturn {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [recentEvents, setRecentEvents] = useState<RealtimeEvent[]>([]);
  const [micDebug, setMicDebug] = useState<MicDebugInfo>({
    micActive: false,
    sampleRate: null,
    chunksSent: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef<TranscriptMessage[]>([]);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // PCM16 chunk buffer for accumulating sub-480 frames
  const pcmBufferRef = useRef<Int16Array>(new Int16Array(CHUNK_SAMPLES));
  const pcmBufferOffsetRef = useRef(0);
  const chunksSentRef = useRef(0);

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

  /** Send a single input_audio_buffer.append event */
  const sendAudioChunk = useCallback((samples: Int16Array) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const audio = int16ToBase64(samples);
      wsRef.current.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio,
      }));
      chunksSentRef.current += 1;
      setMicDebug((prev) => ({ ...prev, chunksSent: chunksSentRef.current }));
    }
  }, []);

  /** Process incoming Int16Array from worklet, enforce 480-sample chunks */
  const processWorkletData = useCallback((data: Int16Array) => {
    let offset = 0;
    while (offset < data.length) {
      const remaining = CHUNK_SAMPLES - pcmBufferOffsetRef.current;
      const available = data.length - offset;
      const toCopy = Math.min(remaining, available);

      pcmBufferRef.current.set(
        data.subarray(offset, offset + toCopy),
        pcmBufferOffsetRef.current,
      );
      pcmBufferOffsetRef.current += toCopy;
      offset += toCopy;

      if (pcmBufferOffsetRef.current === CHUNK_SAMPLES) {
        // Buffer full — send chunk
        sendAudioChunk(pcmBufferRef.current.slice());
        pcmBufferOffsetRef.current = 0;
      }
    }
  }, [sendAudioChunk]);

  const startMic = useCallback(async () => {
    if (audioCtxRef.current) return; // already running

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: { ideal: 24000 },
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaStreamRef.current = stream;

    const audioCtx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = audioCtx;

    await audioCtx.audioWorklet.addModule("/pcm16-processor.js");

    const source = audioCtx.createMediaStreamSource(stream);
    sourceNodeRef.current = source;

    const workletNode = new AudioWorkletNode(audioCtx, "pcm16-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
      processWorkletData(event.data);
    };

    source.connect(workletNode);
    // Connect to destination to keep the audio graph alive (worklet outputs silence)
    workletNode.connect(audioCtx.destination);

    // Reset chunk counter and buffer
    chunksSentRef.current = 0;
    pcmBufferOffsetRef.current = 0;

    setMicDebug({
      micActive: true,
      sampleRate: audioCtx.sampleRate,
      chunksSent: 0,
    });

    addEvent({ type: "mic.started", sampleRate: audioCtx.sampleRate, timestamp: Date.now() });
  }, [processWorkletData, addEvent]);

  const stopMic = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    pcmBufferOffsetRef.current = 0;

    setMicDebug((prev) => ({ ...prev, micActive: false }));
    addEvent({ type: "mic.stopped", chunksSent: chunksSentRef.current, timestamp: Date.now() });
  }, [addEvent]);

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
        // TODO: Handle audio events for playback (Phase 3)
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
      // Stop mic
      if (workletNodeRef.current) {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
      // Close WS
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
    micDebug,
    connect,
    disconnect,
    sendEvent,
    startMic,
    stopMic,
  };
}
