# AgentNotify

AgentNotify is a personal notification hub for AI coding agents. The MVP receives raw OpenCode hook events, formats short action-focused notifications on the server, logs safe event summaries, and sends Bark notifications to iPhone and Apple Watch.

## MVP Scope

- OpenCode plugin example
- Server-side OpenCode formatter
- Bark provider
- Hono `/events` and `/health`
- JSONL logs
- `agent-notify test`
- `agent-notify doctor`
- Docker deployment

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

In another terminal:

```bash
pnpm agent-notify doctor
pnpm agent-notify test
```

## OpenCode Adapter

Copy `examples/opencode/agent-notify.ts` into an OpenCode plugin location and set:

```bash
export AGENT_NOTIFY_SERVER_URL=http://127.0.0.1:8787
export AGENT_NOTIFY_TOKEN=dev-token-change-me
export AGENT_NOTIFY_TIMEOUT_MS=2000
```

The adapter only forwards notification-worthy OpenCode hooks:

- `permission.v2.asked`
- `permission.asked`
- `session.error`

The adapter sends the raw OpenCode event to the server as:

```json
{
  "agent": "opencode",
  "raw": {
    "type": "permission.v2.asked"
  }
}
```

The server formats the raw event into a short notification. The adapter is fail-safe: server errors do not block OpenCode.

## Docker

```bash
export AGENT_NOTIFY_TOKENS=macbook:dev-token-change-me
export BARK_ENDPOINT=https://api.day.app/example-device-key
docker compose -f deploy/docker/docker-compose.yml up --build
```

## Security

- Do not commit `.env`.
- Do not share `events.jsonl` without reviewing it.
- Raw payload logging is disabled by default.
