<div align="center">

## AgentNotify: Personal Notification Hub for AI Coding Agents

English / [中文](README-CN.md)

[Human Installation Manual](docs/human-manual-en.md)

[![](https://img.shields.io/github/stars/LetTTGACO/agent-notify?labelColor\&style=flat-square\&color=ffcb47)](https://github.com/LetTTGACO/agent-notify)
[![](https://img.shields.io/github/issues/LetTTGACO/agent-notify?labelColor=black\&style=flat-square\&color=ff80eb)](https://github.com/LetTTGACO/agent-notify/issues)
[![](https://img.shields.io/github/contributors/LetTTGACO/agent-notify?color=c4f042\&labelColor=black\&style=flat-square)](https://github.com/LetTTGACO/agent-notify/graphs/contributors)
[![](https://img.shields.io/github/last-commit/LetTTGACO/agent-notify?color=c4f042\&labelColor=black\&style=flat-square)](https://github.com/LetTTGACO/agent-notify/commits/main)

</div>
---

AgentNotify receives hook events from OpenCode, Claude Code, and Codex, formats short action-focused notifications on the server, logs safe event summaries, and pushes them to your phone or desktop via Bark or ntfy.

## What it does

- Receives raw hook events from OpenCode, Claude Code, and Codex.
- Formats short, action-focused notifications server-side (permission requests, prompts, errors, long-task completion).
- Keeps short tasks quiet and only pings when a session has run long enough to matter.
- Tames rapid notify-handle-continue loops with a session-scoped cooldown for permission/question alerts.
- Pushes through Bark (iPhone / Apple Watch) or ntfy (cross-platform).

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

Human manual:

- [人类使用手册（中文）](docs/human-manual-cn.md)
- [Human Manual (English)](docs/human-manual-en.md)

End-to-end deployment manual for AI coding agents. Send the document link below to your agent, and it can follow the manual step by step:

- [AgentNotify AI Operation Manual](docs/ai-operation-manual.md)

Send this to your AI agent to deploy AgentNotify:

```
Follow this manual to set up and configure AgentNotify:
https://raw.githubusercontent.com/LetTTGACO/agent-notify/refs/heads/main/docs/ai-operation-manual.md
```

## License

[MIT](LICENSE) © LetTTGACO
