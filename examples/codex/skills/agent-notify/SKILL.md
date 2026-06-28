---
name: agent-notify
description: "Handle AgentNotify Codex control commands. Use when the user invokes /agent-notify with no arguments, on, off, off duration, off persist, or status. Explain the local notification switch result and read the Codex AgentNotify state file for status."
---

# AgentNotify Codex Command

You are handling an AgentNotify notification switch command inside Codex.

The Codex AgentNotify hook adapter handles the local side effects when the prompt
is submitted:

- It writes `~/.config/agent-notify/state/codex.json`.
- It mutes or unmutes forwarding to the AgentNotify server.
- It keeps AgentNotify server behavior unchanged.

Do not call the AgentNotify server. Do not edit project files. Do not rewrite
the state file unless the user explicitly asks for manual repair.

## Command Forms

Only treat the message as an AgentNotify command when it exactly matches one of
the supported command forms below. Do not infer a valid command from a prefix.

If the message starts with `/agent-notify` but includes extra text beyond a
supported command form, treat it as invalid and use the invalid-command
template. Examples:

- `/agent-notify on please`: invalid
- `/agent-notify status explain this`: invalid
- `/agent-notify off 1h then summarize`: invalid
- `/agent-notify clear please`: invalid

If the user includes other text before the command, answer normally and do not
say the hook has applied a state change. Example:

- `请解释 /agent-notify off 是什么`: normal question, not a command

Supported commands:

- no arguments, equivalent to `status`
- `clear`
- `off`
- `off <duration>`, where duration uses `s`, `m`, `h`, or `d`
- `off persist`
- `on`
- `status`

## Responses

For `clear`, `off`, `off <duration>`, `off persist`, and `on`, trust that the
Codex hook adapter has already applied the state change. Reply with exactly one
short confirmation sentence.

Use these templates:

- `clear`: `AgentNotify: Codex 会话静音记录已清除。`
- `off`: `AgentNotify: Codex 当前会话通知已关闭。`
- `off <duration>`: `AgentNotify: Codex 通知已关闭，持续 <duration>。`
- `off persist`: `AgentNotify: Codex 通知已持久关闭。`
- `on`: `AgentNotify: Codex 通知已开启。`

For invalid commands, reply:

`AgentNotify: 用法是 /agent-notify on、/agent-notify off、/agent-notify off 30m、/agent-notify off persist、/agent-notify clear 或 /agent-notify status。`

Do not add extra explanation unless the user asks.

## Status

For `status`, read the Codex state file:

```text
$HOME/.config/agent-notify/state/codex.json
```

If the file is missing, report that Codex notifications are on.

If the file is malformed or unreadable, report that the state file could not be
read and that the Codex adapter treats bad state as enabled.

The state schema is:

```json
{
  "persistentDisabled": false,
  "temporaryDisabledUntil": "2026-06-28T08:30:00.000Z",
  "currentSessionId": "session-id",
  "disabledSessions": {
    "session-id": { "disabledAt": "2026-06-28T08:00:00.000Z" }
  }
}
```

`currentSessionId` is the latest Codex session id observed by the AgentNotify
adapter while handling an `/agent-notify` command. It exists to let this skill
answer `status` accurately when the Codex command still reaches the model as a
fallback prompt. Use it only for status display; notification forwarding is
still decided by the adapter from each event's real session id.

Status precedence is:

1. `persistentDisabled === true`: persistently muted.
2. `temporaryDisabledUntil` is a valid future ISO timestamp: timed mute.
3. `currentSessionId` is a non-empty string and exists in `disabledSessions`:
   current-session mute.
4. `currentSessionId` is a non-empty string and does not exist in
   `disabledSessions`: current-session notifications are on.
5. `disabledSessions` has entries: session mute records exist, but the current
   session id is unknown.
6. Otherwise: notifications are on.

Do not infer the current session id from old mute records. Only use
`currentSessionId` when it is a non-empty string. If session mute records exist
but `currentSessionId` is missing, say how many session mute records exist and
that notification events will be judged by their actual session id.

Use one of these status templates:

- On: `AgentNotify: Codex 通知已开启。`
- Persistent mute: `AgentNotify: Codex 通知已持久关闭。`
- Timed mute: `AgentNotify: Codex 通知已关闭，直到 <ISO timestamp>。`
- Current-session mute: `AgentNotify: Codex 当前会话通知已关闭。`
- Current-session on: `AgentNotify: Codex 当前会话通知已开启。`
- Session records only: `AgentNotify: Codex 有 <count> 个会话静音记录；通知事件会按实际 session 自动判断。`
- Bad state: `AgentNotify: Codex 状态文件无法读取，adapter 会按通知已开启处理。`
