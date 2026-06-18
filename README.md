# AgentNotify

AgentNotify is a personal notification hub for AI coding agents. It receives hook events from OpenCode, Claude Code, and Codex, formats short action-focused notifications on the server, logs safe event summaries, and pushes them to your phone or desktop via Bark or ntfy.

## What it does

- Receives raw hook events from OpenCode, Claude Code, and Codex.
- Formats short, action-focused notifications server-side (permission requests, prompts, errors, long-task completion).
- Keeps quick turns silent and only pings when a session has run long enough to matter.
- Tames rapid notify-handle-continue loops with a session-scoped cooldown for permission/question alerts.
- Pushes through Bark (iPhone / Apple Watch) or ntfy (cross-platform).
- Logs safe event summaries to JSONL. Raw payload logging is off by default.

## Supported agents

| Agent | How it connects | Forwards |
| --- | --- | --- |
| OpenCode | plugin example | permission / question / session-error / idle-completion events |
| Claude Code | command hook + adapter | `UserPromptSubmit`, selected `Notification`, `Stop`, `StopFailure` |
| Codex | command hook + adapter | `UserPromptSubmit`, `PermissionRequest`, `Stop` |

The adapter is fail-safe: server errors never block the agent. Long-task completion is tracked in the AgentNotify server, so adapters stay stateless.

## Notification providers

| Platform / Device | Bark | ntfy |
| --- | --- | --- |
| iPhone / Apple Watch | ✅ recommended | ✅ |
| Android | ❌ | ✅ recommended |
| macOS desktop | ❌ | ✅ |
| Windows desktop | ❌ | ✅ |
| Linux desktop | ❌ | ✅ |
| Web browser | ❌ | ✅ |

## Documentation

The manuals below are the installation guides — start there for full setup, including adapter installation, hook configuration, and Docker deployment.

For humans:

- [人类使用手册（中文）](docs/human-manual-cn.md)
- [Human Manual (English)](docs/human-manual-en.md)

For AI coding agents — an end-to-end deployment playbook written for the agent to follow. Send the link below to your agent to get started in one step:

- [AgentNotify AI Operation Manual](docs/ai-operation-manual.md)

Send this to your agent to deploy AgentNotify from the manual:

```
Follow this manual to set up and configure AgentNotify:
https://raw.githubusercontent.com/LetTTGACO/agent-notify/refs/heads/main/docs/ai-operation-manual.md
```

## License

[MIT](LICENSE) © LetTTGACO
