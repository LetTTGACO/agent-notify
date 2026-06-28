---
name: agent-notify
description: "Handle AgentNotify control commands. Use when the user invokes /agent-notify. Explain the local notification switch result and read the matching AgentNotify state file for status."
---

# AgentNotify Command

You are handling an AgentNotify notification switch command for the current AI
agent. This skill may be loaded by more than one agent, so identify the active
agent from the runtime, prompt, and surrounding context instead of assuming it
from the skill file location.

The active tool's AgentNotify adapter/plugin handles local side effects before
the model responds:

- It writes the matching state file for the active tool.
- It mutes or unmutes forwarding to the AgentNotify server.
- It keeps AgentNotify server behavior unchanged.

Do not call the AgentNotify server. Do not edit project files. Do not rewrite
the state file unless the user explicitly asks for manual repair.

## Command Forms

Treat both forms as AgentNotify commands:

- `/agent-notify <args>`
- `AgentNotify command: <args>`

Only treat the message as an AgentNotify command when it exactly matches one of
the supported command forms below. Do not infer a valid command from a prefix.

If the message starts with `/agent-notify` or `AgentNotify command:` but includes
extra text beyond a supported command form, treat it as invalid and use the
invalid-command template. Examples:

- `/agent-notify on please`: invalid
- `/agent-notify status explain this`: invalid
- `/agent-notify off 1h then summarize`: invalid
- `AgentNotify command: off please`: invalid
- `AgentNotify command: clear please`: invalid

If the user includes other text before the command, answer normally and do not
say the adapter/plugin has applied a state change. Example:

- `请解释 /agent-notify off 是什么`: normal question, not a command

Supported commands:

- no arguments, equivalent to `status`
- `clear`
- `off`
- `off <duration>`, where duration uses `s`, `m`, `h`, or `d`
- `off persist`
- `on`
- `status`

## Active Tool

Determine the active AI agent before choosing response text or reading status.
Use the agent that is actually running this conversation, such as OpenCode,
Claude Code, or Codex. Do not assume the agent from the directory where this
skill was loaded.

Use the matching state file for that agent:

- OpenCode: `$HOME/.config/agent-notify/state/opencode.json`
- Claude Code: `$HOME/.config/agent-notify/state/claude-code.json`
- Codex: `$HOME/.config/agent-notify/state/codex.json`

If the current agent cannot be determined, do not guess a state file. For
`status`, say that AgentNotify cannot determine the current AI agent from the
skill context.

## Responses

For `clear`, `off`, `off <duration>`, `off persist`, and `on`, trust that the
active tool's adapter/plugin has already applied the state change. Reply with
exactly one short confirmation sentence.

Use these templates:

- `clear`: `AgentNotify: <tool> 会话静音记录已清除。`
- `off`: `AgentNotify: <tool> 当前会话通知已关闭。`
- `off <duration>`: `AgentNotify: <tool> 通知已关闭，持续 <duration>。`
- `off persist`: `AgentNotify: <tool> 通知已持久关闭。`
- `on`: `AgentNotify: <tool> 通知已开启。`

For invalid commands, reply:

`AgentNotify: 用法是 /agent-notify on、/agent-notify off、/agent-notify off 30m、/agent-notify off persist、/agent-notify clear 或 /agent-notify status。`

Do not add extra explanation unless the user asks.

## Status

For `status`, read the state file for the active tool.

If the file is missing, report that the active tool's notifications are on.

If the file is malformed or unreadable, report that the state file could not be
read and that the active tool's adapter/plugin treats bad state as enabled.

The state schema is:

```json
{
  "persistentDisabled": false,
  "temporaryDisabledUntil": "2026-06-28T08:30:00.000Z",
  "disabledSessions": {
    "session-id": { "disabledAt": "2026-06-28T08:00:00.000Z" }
  }
}
```

Status precedence is:

1. `persistentDisabled === true`: persistently muted.
2. `temporaryDisabledUntil` is a valid future ISO timestamp: timed mute.
3. `disabledSessions` has entries: session mute records exist.
4. Otherwise: notifications are on.

The skill usually cannot know the current session id. Do not claim that the
current session is muted unless the current session id is explicitly available.
If session mute records exist but the current session id is unknown, say how many
session mute records exist.

Use one of these status templates:

- On: `AgentNotify: <tool> 通知已开启。`
- Persistent mute: `AgentNotify: <tool> 通知已持久关闭。`
- Timed mute: `AgentNotify: <tool> 通知已关闭，直到 <ISO timestamp>。`
- Session records only: `AgentNotify: <tool> 有 <count> 个会话静音记录；当前会话是否静音无法从 skill 上下文确认。`
- Bad state: `AgentNotify: <tool> 状态文件无法读取，adapter/plugin 会按通知已开启处理。`
