# Native Multimodal Real-Time AI Tutor

A speech-to-speech AI language tutor built on Cloudflare Workers + Durable Objects, using the OpenAI Realtime API over WebSockets. Single-model architecture — no REST STT/LLM/TTS pipeline.

## Architecture

```
Browser (React)  <--WebSocket-->  CF Worker  <--WebSocket-->  OpenAI Realtime API
                                     |
                                Durable Object
                              (RealtimeSession)
```

- **Frontend** (`/apps/web`): Vite + React + TypeScript. Call-mode UI with transcript, scenario selection, and debug panel.
- **Backend** (`/workers/realtime`): Cloudflare Worker + Durable Object. Bridges client WebSocket to OpenAI Realtime API, handles tool calls server-side.
- **Shared** (`/shared`): TypeScript types, constants, and utilities shared between frontend and backend.
- **Scenarios** (`/scenarios`): JSON lesson scenario definitions.

## Monorepo Structure

```
├── apps/web/                  # Vite + React frontend
│   ├── src/
│   │   ├── components/        # TranscriptBubble, DebugPanel
│   │   ├── hooks/             # useRealtime WebSocket hook
│   │   └── pages/             # ScenarioMenu, CallScreen
│   └── vite.config.ts         # Proxy config for local dev
├── workers/realtime/          # Cloudflare Worker + Durable Object
│   ├── src/
│   │   ├── index.ts           # Worker entry: routes, CORS, WS upgrade
│   │   ├── durable-object.ts  # RealtimeSession DO: upstream bridge + tool calls
│   │   ├── scenarios.ts       # Embedded scenario loader
│   │   ├── tools.ts           # Tool call stubs (grade_lesson, trigger_quiz)
│   │   └── env.ts             # Environment type definitions
│   └── wrangler.toml          # Wrangler config with DO binding
├── shared/                    # Shared types and constants
│   └── src/
│       ├── types.ts
│       ├── constants.ts
│       └── index.ts
├── scenarios/                 # Scenario JSON files
│   ├── index.json
│   └── a1_taxi_bogota.json
├── pnpm-workspace.yaml
└── package.json               # Root scripts (dev, build, typecheck)
```

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed as a workspace dev dependency)
- An OpenAI API key with Realtime API access

## Setup

```bash
# Install all dependencies
pnpm install

# Set your OpenAI API key as a Wrangler secret
cd workers/realtime
npx wrangler secret put OPENAI_API_KEY
# Paste your key when prompted
cd ../..
```

For local development, you can also create a `.dev.vars` file in `workers/realtime/`:

```
OPENAI_API_KEY=sk-your-key-here
```

> **Note:** `.dev.vars` is gitignored. Never commit API keys.

## Development

Run both the worker and web dev servers:

```bash
pnpm dev
```

Or run them separately:

```bash
# Terminal 1: Worker (port 8787)
pnpm dev:worker

# Terminal 2: Frontend (port 5173)
pnpm dev:web
```

The Vite dev server proxies `/api/*` and `/ws` to the worker at `localhost:8787`, so the browser connects to a single origin.

Open [http://localhost:5173](http://localhost:5173) in your browser.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check → `{ ok: true }` |
| GET | `/api/scenarios` | List all scenarios |
| GET | `/api/scenarios/:id` | Get a single scenario |
| GET | `/ws?scenario=<id>&user=<id>` | WebSocket upgrade → Durable Object session |

## Configuration

### Environment Variables (wrangler.toml `[vars]`)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-mini-2025-12-15` | OpenAI Realtime model to use |
| `ALLOWED_ORIGINS` | `""` (allow all) | Comma-separated list of allowed CORS origins |

### Secrets (set via `wrangler secret put`)

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |

## Deployment

### Worker

```bash
pnpm deploy:worker
```

### Frontend (Cloudflare Pages)

TODO: Configure Cloudflare Pages to build from `/apps/web` and deploy. Set up a custom domain or use the Pages subdomain. Update `ALLOWED_ORIGINS` to include your Pages domain.

## Current Status (Scaffold)

This is the initial scaffold. What works:

- Worker routes (health, scenarios, WebSocket upgrade)
- Durable Object session management
- Upstream WebSocket bridge to OpenAI Realtime API
- Tool call accumulation and stub execution
- Client event whitelisting
- React UI with scenario selection and call screen
- WebSocket hook with transcript extraction
- Debug event panel

### TODOs

- [ ] Audio capture (MediaRecorder/AudioWorklet) and playback in the browser
- [ ] Stream PCM16 audio to/from the WebSocket
- [ ] Handle audio delta events for real-time playback
- [ ] Real tool implementations (grade_lesson persistence, quiz generation)
- [ ] User authentication
- [ ] Session persistence and history
- [ ] Cloudflare Pages deployment configuration
- [ ] Production ALLOWED_ORIGINS configuration
- [ ] Error recovery and reconnection logic
- [ ] Rate limiting
