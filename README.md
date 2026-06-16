# AgentNotify

AgentNotify is a personal notification hub for AI coding agents. The MVP receives raw OpenCode hook events, formats short action-focused notifications on the server, logs safe event summaries, and sends Bark notifications to iPhone and Apple Watch.

For a step-by-step Chinese guide, see [AgentNotify 人类使用手册](docs/user-manual.md).

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

Copy `examples/opencode/agent-notify.ts` into an OpenCode plugin location and create `~/.config/opencode/agent-notify.json`:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "dev-token-change-me",
  "timeoutMs": 2000,
  "completionMinSeconds": 120,
  "debugLogPath": "/Users/1874w/.config/opencode/agent-notify-debug.jsonl"
}
```

The adapter only forwards notification-worthy OpenCode hooks:

- `permission.v2.asked`
- `permission.asked`
- `question.asked`
- `session.error`
- `session.idle` only when `completionMinSeconds` is greater than `0` and the
  session has been busy for at least that many seconds

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

`debugLogPath` is optional. When set, the OpenCode plugin writes one JSONL entry for every event it sees, including whether that event was forwarded to AgentNotify and the raw OpenCode event payload. Treat this file as local debug data and do not share it without review.

## Docker

```bash
export AGENT_NOTIFY_TOKENS=macbook:dev-token-change-me
export AGENT_NOTIFY_LANGUAGE=en # optional: zh
export BARK_ENDPOINT=https://api.day.app/example-device-key
docker compose -f deploy/docker/docker-compose.yml up --build
```

## Security

- Do not commit `.env`.
- Do not share `events.jsonl` without reviewing it.
- Raw payload logging is disabled by default.
