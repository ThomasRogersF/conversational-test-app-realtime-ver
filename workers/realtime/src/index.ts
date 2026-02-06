import type { Env } from "./env.js";
import { getScenarioIndex, getScenario } from "./scenarios.js";

// Re-export the Durable Object class so wrangler can find it
export { RealtimeSession } from "./durable-object.js";

// ---------------------------------------------------------------------------
// CORS / origin guard helpers
// ---------------------------------------------------------------------------

function isOriginAllowed(origin: string | null, allowedOrigins: string): boolean {
  // If no allowed origins configured, allow all (dev-friendly)
  // TODO: In production, always set ALLOWED_ORIGINS
  if (!allowedOrigins) return true;
  if (!origin) return false;

  const list = allowedOrigins.split(",").map((s) => s.trim());
  return list.includes(origin);
}

function corsHeaders(origin: string | null, allowedOrigins: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (isOriginAllowed(origin, allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }

    // Origin guard for non-WebSocket requests
    if (
      request.method === "GET" &&
      !request.headers.get("Upgrade") &&
      !isOriginAllowed(origin, env.ALLOWED_ORIGINS)
    ) {
      // Only enforce for API routes when origin is present
      if (origin && url.pathname.startsWith("/api")) {
        return new Response("Origin not allowed", { status: 403 });
      }
    }

    // --- Routes ---

    // GET /api/health
    if (url.pathname === "/api/health") {
      return Response.json(
        { ok: true },
        { headers: corsHeaders(origin, env.ALLOWED_ORIGINS) },
      );
    }

    // GET /api/scenarios
    if (url.pathname === "/api/scenarios") {
      return Response.json(getScenarioIndex(), {
        headers: corsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }

    // GET /api/scenarios/:id
    if (url.pathname.startsWith("/api/scenarios/")) {
      const id = url.pathname.split("/").pop() || "";
      const scenario = getScenario(id);
      if (!scenario) {
        return Response.json(
          { error: "Scenario not found" },
          { status: 404, headers: corsHeaders(origin, env.ALLOWED_ORIGINS) },
        );
      }
      return Response.json(scenario, {
        headers: corsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }

    // GET /ws?scenario=<id>&user=<id> -> WebSocket upgrade -> Durable Object
    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      // Origin guard for WebSocket
      if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
        if (origin) {
          return new Response("Origin not allowed", { status: 403 });
        }
      }

      const scenarioId = url.searchParams.get("scenario") || "";
      const userId = url.searchParams.get("user") || "anonymous";

      if (!scenarioId) {
        return new Response("Missing scenario query parameter", {
          status: 400,
        });
      }

      // Create a unique DO id per user+scenario session
      const doId = env.REALTIME_SESSION.idFromName(
        `${userId}:${scenarioId}:${Date.now()}`,
      );
      const stub = env.REALTIME_SESSION.get(doId);

      // Forward the WebSocket upgrade to the Durable Object
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
