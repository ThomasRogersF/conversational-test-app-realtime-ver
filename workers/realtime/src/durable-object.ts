import {
  ALLOWED_CLIENT_EVENT_TYPES,
  GLOBAL_TUTOR_RULES,
  OPENAI_REALTIME_WS_BASE,
  type AllowedClientEventType,
  type Scenario,
} from "@ai-tutor/shared";
import type { Env } from "./env.js";
import { getScenario } from "./scenarios.js";
import { executeTool } from "./tools.js";

// ---------------------------------------------------------------------------
// RealtimeSession Durable Object
// ---------------------------------------------------------------------------
// Manages one student session: bridges a client WebSocket to the OpenAI
// Realtime API upstream WebSocket, handles tool calls, and relays events.
// ---------------------------------------------------------------------------

export class RealtimeSession implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  // Active connections
  private clientWs: WebSocket | null = null;
  private upstreamWs: WebSocket | null = null;

  // Session metadata
  private scenarioId = "";
  private userId = "";

  // Tool call accumulation: call_id -> { name, argFragments }
  private pendingToolCalls = new Map<
    string,
    { name: string; argFragments: string[] }
  >();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Only accept WebSocket upgrades
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    this.scenarioId = url.searchParams.get("scenario") || "";
    this.userId = url.searchParams.get("user") || "anonymous";

    const scenario = getScenario(this.scenarioId);
    if (!scenario) {
      return new Response(`Unknown scenario: ${this.scenarioId}`, {
        status: 400,
      });
    }

    // Create WebSocket pair for the client
    const [client, server] = Object.values(new WebSocketPair());

    // Accept the server side so we can send/receive
    server.accept();
    this.clientWs = server;

    // Connect upstream to OpenAI
    try {
      await this.connectUpstream(scenario);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to connect upstream";
      server.send(
        JSON.stringify({ type: "error", error: { message: msg } }),
      );
      server.close(1011, msg);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Wire up client -> upstream relay
    server.addEventListener("message", (event) => {
      this.handleClientMessage(event.data);
    });

    server.addEventListener("close", () => {
      this.cleanup();
    });

    server.addEventListener("error", () => {
      this.cleanup();
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // -----------------------------------------------------------------------
  // Upstream (OpenAI) connection
  // -----------------------------------------------------------------------

  private async connectUpstream(scenario: Scenario): Promise<void> {
    const model = this.env.OPENAI_REALTIME_MODEL;
    const url = `${OPENAI_REALTIME_WS_BASE}?model=${encodeURIComponent(model)}`;

    const upstream = new WebSocket(url, [
      "realtime",
      // Pass auth via subprotocol header workaround for CF Workers:
      // OpenAI accepts Bearer token in the Authorization header.
      // In CF Workers, we use the Sec-WebSocket-Protocol approach.
      `openai-insecure-api-key.${this.env.OPENAI_API_KEY}`,
      "openai-beta.realtime-v1",
    ]);

    this.upstreamWs = upstream;

    return new Promise<void>((resolve, reject) => {
      upstream.addEventListener("open", () => {
        this.onUpstreamOpen(scenario);
        resolve();
      });

      upstream.addEventListener("message", (event) => {
        this.handleUpstreamMessage(event.data);
      });

      upstream.addEventListener("close", (event) => {
        // Forward close to client
        if (this.clientWs?.readyState === WebSocket.OPEN) {
          this.clientWs.close(
            event.code,
            event.reason || "Upstream closed",
          );
        }
      });

      upstream.addEventListener("error", (event) => {
        console.error("Upstream WebSocket error:", event);
        reject(new Error("Upstream WebSocket connection failed"));
      });
    });
  }

  // -----------------------------------------------------------------------
  // On upstream open: send session.update + opening message
  // -----------------------------------------------------------------------

  private onUpstreamOpen(scenario: Scenario): void {
    // 1. Send session.update
    this.sendUpstream({
      type: "session.update",
      session: {
        instructions: GLOBAL_TUTOR_RULES + "\n\n" + scenario.system,
        turn_detection: {
          type: "server_vad",
          interrupt_response: true,
          create_response: true,
        },
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        tools: scenario.tools,
      },
    });

    // 2. Send the opening assistant message
    this.sendUpstream({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "input_text",
            text: scenario.opening_line,
          },
        ],
      },
    });

    // 3. Request the model to respond (so it speaks the opening line)
    this.sendUpstream({
      type: "response.create",
    });
  }

  // -----------------------------------------------------------------------
  // Client -> Upstream relay (with whitelist)
  // -----------------------------------------------------------------------

  private handleClientMessage(data: string | ArrayBuffer): void {
    if (!this.upstreamWs || this.upstreamWs.readyState !== WebSocket.OPEN) {
      return;
    }

    // Only accept string (JSON) messages
    if (typeof data !== "string") {
      return;
    }

    let parsed: { type?: string };
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // Ignore malformed JSON
    }

    // Whitelist check
    const eventType = parsed.type as AllowedClientEventType | undefined;
    if (
      !eventType ||
      !(ALLOWED_CLIENT_EVENT_TYPES as readonly string[]).includes(eventType)
    ) {
      this.sendClient({
        type: "error",
        error: {
          message: `Event type not allowed: ${eventType}`,
        },
      });
      return;
    }

    // Forward as-is
    this.upstreamWs.send(data);
  }

  // -----------------------------------------------------------------------
  // Upstream -> Client relay + tool call handling
  // -----------------------------------------------------------------------

  private handleUpstreamMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") {
      // Binary data (shouldn't happen with Realtime JSON protocol)
      this.clientWs?.send(data);
      return;
    }

    let event: { type?: string; [key: string]: unknown };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    // Handle tool-call accumulation
    switch (event.type) {
      case "response.function_call_arguments.delta":
        this.onToolCallDelta(event);
        break;

      case "response.function_call_arguments.done":
        this.onToolCallDone(event);
        break;
    }

    // Relay everything to the client
    this.sendClient(event);
  }

  // -----------------------------------------------------------------------
  // Tool call accumulation
  // -----------------------------------------------------------------------

  private onToolCallDelta(event: Record<string, unknown>): void {
    const callId = event.call_id as string;
    const delta = event.delta as string;

    if (!callId || typeof delta !== "string") return;

    let entry = this.pendingToolCalls.get(callId);
    if (!entry) {
      entry = { name: (event.name as string) || "", argFragments: [] };
      this.pendingToolCalls.set(callId, entry);
    }

    // Capture name if provided (it's usually on the first delta)
    if (event.name && typeof event.name === "string") {
      entry.name = event.name;
    }

    entry.argFragments.push(delta);
  }

  private onToolCallDone(event: Record<string, unknown>): void {
    const callId = event.call_id as string;
    const name = (event.name as string) || "";

    if (!callId) return;

    const entry = this.pendingToolCalls.get(callId);
    const argsString = entry
      ? entry.argFragments.join("")
      : (event.arguments as string) || "{}";
    const toolName = entry?.name || name;

    this.pendingToolCalls.delete(callId);

    // Parse args safely
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsString);
    } catch (err) {
      // Return error output so the model knows parsing failed
      const errorOutput = JSON.stringify({
        ok: false,
        error: `Failed to parse tool arguments: ${err instanceof Error ? err.message : "unknown"}`,
      });

      this.sendUpstream({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: errorOutput,
        },
      });
      this.sendUpstream({ type: "response.create" });
      return;
    }

    // Execute tool stub
    const output = executeTool(toolName, args, this.scenarioId);

    // Send result back to OpenAI
    this.sendUpstream({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output,
      },
    });

    // Request a new response so the model continues speaking after the tool result
    this.sendUpstream({ type: "response.create" });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private sendUpstream(data: unknown): void {
    if (this.upstreamWs?.readyState === WebSocket.OPEN) {
      this.upstreamWs.send(JSON.stringify(data));
    }
  }

  private sendClient(data: unknown): void {
    if (this.clientWs?.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(data));
    }
  }

  private cleanup(): void {
    if (
      this.upstreamWs &&
      this.upstreamWs.readyState === WebSocket.OPEN
    ) {
      this.upstreamWs.close(1000, "Client disconnected");
    }
    this.upstreamWs = null;
    this.clientWs = null;
    this.pendingToolCalls.clear();
  }
}
