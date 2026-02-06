// ---------------------------------------------------------------------------
// Scenario types
// ---------------------------------------------------------------------------

/** Tool parameter schema (JSON Schema subset used by OpenAI function calling) */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/** A single tool (function) definition for the OpenAI Realtime API */
export interface ScenarioTool {
  type: "function";
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** A full scenario definition loaded from /scenarios/<id>.json */
export interface Scenario {
  id: string;
  level: string;
  title: string;
  /** System prompt appended to global tutor rules */
  system: string;
  /** The AI tutor's first spoken line */
  opening_line: string;
  /** Function-calling tools available in this scenario */
  tools: ScenarioTool[];
}

/** Entry in /scenarios/index.json */
export interface ScenarioIndexEntry {
  id: string;
  level: string;
  title: string;
}

// ---------------------------------------------------------------------------
// WebSocket / Realtime event helpers
// ---------------------------------------------------------------------------

/** Client -> Worker event types that we allow through */
export const ALLOWED_CLIENT_EVENT_TYPES = [
  "input_audio_buffer.append",
  "input_audio_buffer.commit",
  "response.cancel",
  "conversation.item.truncate",
  "response.create",
  "conversation.item.create",
  "session.update",
] as const;

export type AllowedClientEventType = (typeof ALLOWED_CLIENT_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Transcript message (for the frontend)
// ---------------------------------------------------------------------------

export interface TranscriptMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Health response
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: true;
}
