# AgentNotify

AgentNotify is a personal notification hub for AI coding agents. The MVP receives raw OpenCode, Claude Code, and Codex hook events, formats short action-focused notifications on the server, logs safe event summaries, and sends Bark notifications to iPhone and Apple Watch.

For a step-by-step Chinese guide, see [AgentNotify 人类使用手册](docs/user-manual.md).

## MVP Scope

- OpenCode plugin example
- Claude Code and Codex command-hook adapter examples
- Server-side OpenCode, Claude Code, and Codex formatters
- Bark and ntfy providers
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

## Notification Provider

Bark remains the default provider:

```bash
AGENT_NOTIFY_PROVIDER=bark
BARK_ENDPOINT=https://api.day.app/example-device-key
```

To use ntfy instead, subscribe to the same topic in your ntfy client and configure:

```bash
AGENT_NOTIFY_PROVIDER=ntfy
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_xxx
NTFY_TOKEN=
```

Use a hard-to-guess topic name on public `ntfy.sh`. For protected self-hosted topics, set `NTFY_TOKEN` to a publish token.

## OpenCode Adapter

Copy `examples/opencode/agent-notify.ts` into an OpenCode plugin location and create `~/.config/opencode/agent-notify.json`:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "dev-token-change-me",
  "timeoutMs": 2000,
  "completionMinSeconds": 120,
  "debugLogPath": "/ABS/PATH/.config/opencode/agent-notify-debug.jsonl"
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

## Claude Code Adapter

Claude Code does not use the OpenCode plugin API. Use a command hook that runs the example adapter:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/agent-notify.mjs"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/agent-notify.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/agent-notify.mjs"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/agent-notify.mjs"
          }
        ]
      }
    ]
  }
}
```

Create `~/.config/agent-notify/claude-code.json`:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "dev-token-change-me",
  "timeoutMs": 2000,
  "debugLogPath": "/ABS/PATH/.config/agent-notify/claude-code-debug.jsonl"
}
```

The adapter forwards `UserPromptSubmit`, selected `Notification` types, `Stop`, and `StopFailure`.
Claude Code's `idle_prompt` notification is ignored by default so ordinary completed turns do not duplicate long-task completion notifications.
If you want Claude Code to invoke the adapter less often, you can optionally add a `Notification` matcher such as `permission_prompt|elicitation_dialog|elicitation_complete|elicitation_response`.
It is stateless: long-task completion tracking happens in the AgentNotify server.
Enable Claude Code completion notifications by setting
`AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` on the server, for example `120`.
The server keeps completion state in memory, deletes it on `Stop` or `StopFailure`,
and prunes abnormal leftovers with a 24-hour TTL and 1000-session cap.

## Codex Adapter

Codex uses command hooks. Copy the example adapter to a stable local config path:

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/agent-notify.mjs ~/.config/agent-notify/codex-agent-notify.mjs
```

Create `~/.config/agent-notify/codex.json`:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "dev-token-change-me",
  "timeoutMs": 2000,
  "debugLogPath": "/ABS/PATH/.config/agent-notify/codex-debug.jsonl"
}
```

Configure user-level Codex hooks in `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/codex-agent-notify.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/codex-agent-notify.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/codex-agent-notify.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The adapter forwards `UserPromptSubmit`, user-actionable `PermissionRequest`, and `Stop`.
`PermissionRequest` sends an immediate permission notification unless Codex reports `permission_mode: "bypassPermissions"`.
`UserPromptSubmit` only records server-side state.
`Stop` sends a completion notification only when the server threshold is enabled
and the turn lasted at least that many seconds.

Enable Codex completion notifications on the server with:

```bash
AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120
```

When a Codex hook is installed or changed, open `/hooks` in Codex and review/trust the hook before relying on it.

## Docker

```bash
export AGENT_NOTIFY_TOKENS=macbook:dev-token-change-me
export AGENT_NOTIFY_LANGUAGE=en # optional: zh
export AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=120 # optional
export AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120 # optional
export BARK_ENDPOINT=https://api.day.app/example-device-key
docker compose -f deploy/docker/docker-compose.yml up --build
```

## Security

- Do not commit `.env`.
- Do not share `events.jsonl` without reviewing it.
- Raw payload logging is disabled by default.
