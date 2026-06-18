# AgentNotify User Manual

This manual is for anyone who wants phone or desktop notifications from OpenCode, Claude Code, or Codex. Follow the setup once, and your AI coding agent's key events get forwarded to AgentNotify, which pushes them to your device via Bark or ntfy.

## What this project does

AgentNotify is a local notification relay:

1. OpenCode, Claude Code, or Codex hits an event that needs your attention — a permission request, a question to choose, a long task finishing, or a session error.
2. A local adapter forwards the event to the AgentNotify service on your machine.
3. AgentNotify formats it into a short notification.
4. AgentNotify calls the configured provider (Bark or ntfy) to push the notification to your phone or desktop.

The current version mainly supports these OpenCode events:

- `permission.v2.asked`: pushes a permission notification when an action needs approval.
- `permission.asked`: legacy permission request, same as above.
- `question.asked`: pushes when you need to pick from options, reminding you to come back and choose.
- `session.error`: pushes a failure notification on session errors.
- `session.idle`: records session lifecycle, used for long-task completion notifications.

In other words, it does not forward every step to you — only the events that need your attention.

Claude Code supports these hooks:

- `UserPromptSubmit`: only records this turn's start time server-side; no phone notification.
- `Notification`: pushes when Claude Code needs permission approval or an MCP interaction; plain `idle_prompt` is ignored by default.
- `Stop`: pushes a completion notification after the task exceeds the server completion threshold (default `120` seconds).
- `StopFailure`: pushes on task failure or quota errors.

Codex supports these hooks:

- `UserPromptSubmit`: only records this turn's start time server-side; no phone notification.
- `PermissionRequest`: pushes when Codex needs user permission; not pushed when `permission_mode` is `bypassPermissions`.
- `Stop`: pushes a completion notification after the task exceeds the server completion threshold (default `120` seconds).

## Interaction cooldown (noise reduction)

When you handle several permissions or questions in a row at the computer, back-to-back notifications get noisy. AgentNotify applies a server-side cooldown to `permission` / `question` notifications:

- The first permission/question notification in an agent session is pushed normally.
- Within the cooldown window afterwards (default `60` seconds), same-type notifications from that session are suppressed.
- Every cooled event refreshes the window, so it stays silent throughout an active back-and-forth; only after you stop for longer than the window does the next event notify again.

The cooldown is scoped per `token + agent + session`, so parallel sessions and different agents don't interfere. `completed` / `failed` notifications are not cooled (they are throttled by their own completion thresholds). When a session id is missing, the event passes through to avoid swallowing the first notice. The window is tunable via `AGENT_NOTIFY_COOLDOWN_SECONDS`; set it to `0` to disable.

## Notification title project-name prefix

Notification titles are automatically prefixed with the project name when AgentNotify can identify a working directory, for example `[agent-notify] Approve permission`. Claude Code and Codex use the `cwd` field from the hook payload. The OpenCode plugin adds the current project directory as `raw.cwd` before forwarding the event so the server can generate the same prefix. If no usable directory is available, the title stays unchanged.

## Notification providers: Bark and ntfy

After formatting an event, AgentNotify pushes it through a provider to your device. Two providers are supported, selected via `AGENT_NOTIFY_PROVIDER` in `.env`; the default is `bark`.

### Bark

[Bark](https://github.com/Finb/Bark) is an iOS-only push app. Install Bark on your iPhone, grab the device key, and AgentNotify can push notifications to your iPhone and Apple Watch.

- The official endpoint looks like `https://api.day.app/your-device-key`.
- You can also self-host Bark and use your own endpoint.
- AgentNotify marks `time_sensitive` notifications with Bark's `timeSensitive` level so they bypass Focus mode, and includes group, icon, and sound fields.

Bark only reaches Apple devices. If you use Android, Windows, Linux, or want desktop notifications, choose ntfy below.

### ntfy

[ntfy](https://ntfy.sh/) is a cross-platform push service with clients for Android, iOS, desktop (Windows / macOS / Linux), and the web. You subscribe to a topic on any client, AgentNotify publishes to that topic, and every subscriber receives it.

- On the public `https://ntfy.sh/`, the topic name acts as a shared secret — use a hard-to-guess random string, e.g. `https://ntfy.sh/agent_notify_long_random_text`.
- You can also self-host ntfy.
- If the topic requires auth, set `NTFY_TOKEN` (a Bearer token); leave it empty for public topics.
- AgentNotify sends `time_sensitive` notifications at ntfy's highest priority (`priority=4`).

### Platform support at a glance

| Platform / Device | Bark | ntfy |
| --- | --- | --- |
| iPhone / Apple Watch | ✅ recommended | ✅ |
| Android | ❌ | ✅ recommended |
| macOS desktop | ❌ | ✅ |
| Windows desktop | ❌ | ✅ |
| Linux desktop | ❌ | ✅ |
| Web browser | ❌ | ✅ |

Choosing a provider:

- Apple devices only → Bark, simplest to configure.
- Cross-platform, multi-device, or a team sharing the same notifications → ntfy; everyone subscribes to the same topic.

Both providers are configured via `.env`, see Step 2. Only one `AGENT_NOTIFY_PROVIDER` can be active at a time.

## What you need

- Node.js 20 or higher
- pnpm
- OpenCode / Claude Code / Codex (at least one)
- One notification provider:
  - Bark: install Bark on iPhone and get the endpoint (e.g. `https://api.day.app/your-device-key`)
  - ntfy: subscribe to a private topic in a phone or desktop ntfy client and get the topic URL

## Step 1: Install dependencies

In the project directory:

```bash
pnpm install
```

## Step 2: Configure the AgentNotify server

Copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and confirm at least these entries:

```bash
AGENT_NOTIFY_HOST=0.0.0.0
AGENT_NOTIFY_PORT=8787
AGENT_NOTIFY_TOKENS=macbook:dev-token-change-me
AGENT_NOTIFY_PROVIDER=bark
AGENT_NOTIFY_LANGUAGE=en
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=120
AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120
AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS=120
AGENT_NOTIFY_COOLDOWN_SECONDS=60
BARK_ENDPOINT=https://api.day.app/example-device-key
NTFY_ENDPOINT=
NTFY_TOKEN=
AGENT_NOTIFY_LOG_PATH=./data/events.jsonl
AGENT_NOTIFY_LOG_RAW=false
```

What you need to change:

- `AGENT_NOTIFY_PROVIDER`: the notification provider, default `bark`; can also be `ntfy`.
- `BARK_ENDPOINT`: your Bark endpoint when using Bark.
- `NTFY_ENDPOINT`: the full topic URL when using ntfy, e.g. `https://ntfy.sh/agent_notify_long_random_text`
- `NTFY_TOKEN`: optional Bearer token for a protected ntfy topic; leave empty for public topics.
- `AGENT_NOTIFY_LANGUAGE`: notification text language, `en` or `zh`, default `en`.
- `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`: Claude Code completion threshold in seconds, default `120`. After a task runs longer than this, a completion notification is pushed when it ends; set `0` to disable Claude Code completion notifications.
- `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS`: Codex completion threshold in seconds, default `120`. Same behavior as above; set `0` to disable Codex completion notifications.
- `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS`: OpenCode completion threshold in seconds, default `120`. Same behavior as above; set `0` to disable OpenCode completion notifications.
- `AGENT_NOTIFY_COOLDOWN_SECONDS`: interaction cooldown window in seconds, default `60`. The noise-reduction window for back-to-back permission/question notifications; set `0` to disable. See "Interaction cooldown (noise reduction)" above.

Consider changing `dev-token-change-me` to a string only you know, e.g.:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

When you configure the OpenCode / Claude Code / Codex plugins later, the `token` in each `json` config file must match this token — the part after the colon.

## Step 3: Start AgentNotify

Start in dev mode:

```bash
pnpm dev
```

You should see something like:

```text
agent-notify listening on 0.0.0.0:8787
```

The service listens at:

```text
http://127.0.0.1:8787
```

## Step 4: Check the service

In another terminal, in the project directory:

```bash
pnpm agent-notify doctor
```

When healthy you will see several `OK` lines, including:

- The current provider's (`bark` or `ntfy`) endpoint is configured
- The log directory is writable
- `/health` is reachable

Then send a test event:

```bash
pnpm agent-notify test
```

If configured correctly, your phone should receive a test notification.

## Step 5: Connect your AI coding agent

Once all three agents are connected, the new files look roughly like this:

```text
~/.config/
├── agent-notify/
│   ├── claude-code.json               # Claude Code adapter config
│   ├── claude-code-agent-notify.mjs   # Claude Code adapter file
│   ├── codex.json                     # Codex adapter config
│   └── codex-agent-notify.mjs         # Codex adapter file
└── opencode/                          # OpenCode directory
    ├── agent-notify.json              # OpenCode plugin config
    └── plugins/
        └── agent-notify.ts            # OpenCode plugin file
```

Claude Code hooks live in its settings file (user-level `~/.claude/settings.json` or project-level `.claude/settings.json`).

Codex hooks live in `~/.codex/hooks.json`.

## OpenCode setup

The project ships an OpenCode plugin example:

```text
examples/opencode/agent-notify.ts
```

Install it one of two ways:

- Globally: copy to `~/.config/opencode/plugins/`
- For the current project only: copy to the project's `.opencode/plugins/`

Global install:

```bash
mkdir -p ~/.config/opencode/plugins
cp examples/opencode/agent-notify.ts ~/.config/opencode/plugins/agent-notify.ts
```

### 1. Confirm the server config

Make sure `.env` has the server token and the Bark / ntfy endpoint:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark or ntfy
BARK_ENDPOINT=https://api.day.app/your-device-key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
```

### 2. Install the OpenCode plugin

The plugin reads this config file:

```text
~/.config/opencode/agent-notify.json
```

Copy the example and edit it (run from the project directory):

```bash
mkdir -p ~/.config/opencode
cp examples/opencode/agent-notify.json ~/.config/opencode/agent-notify.json
```

The minimal config after copying:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

- `serverUrl`: required. The AgentNotify server URL.
- `token`: required. Must match the token part of `AGENT_NOTIFY_TOKENS` in `.env` — the part after the colon.
- `timeoutMs`: optional. Plugin request timeout in milliseconds, default `2000`.
- `debugLogPath`: optional. When set, the plugin writes every event it sees to this JSONL file, including the raw OpenCode event, to help confirm whether events reach the plugin. Off by default.

If this file is missing, has broken JSON, or is missing required fields, the plugin fails to initialize. OpenCode keeps plugin failures inside the plugin boundary, so a misconfigured AgentNotify plugin won't block your normal OpenCode work.

### 3. Verify OpenCode notifications

Keep the AgentNotify service running:

```bash
pnpm dev
```

Then start OpenCode:

```bash
opencode
```

Trigger an action that needs permission in OpenCode. For example, tell OpenCode to mock a question with options. Once the plugin catches it, it sends the event and a notification to AgentNotify.

To verify long-task completion notifications, temporarily lower the threshold in the server `.env` by setting `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS`:

```
AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS=5
```

Restart the server and have OpenCode run a task longer than 5 seconds. You should get a completion notification when the task ends. Set it back to `120` afterwards to restore the default threshold.

## Claude Code setup

### 1. Confirm the server config

Make sure `.env` has the server token and the Bark / ntfy endpoint:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark or ntfy
BARK_ENDPOINT=https://api.day.app/your-device-key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=120
```

Long-task completion notifications are on by default, threshold `120` seconds: only after a task runs longer than 120 seconds is a completion notification pushed when it ends.

To turn completion notifications off, set the threshold to `0`. With `0`, Claude Code's permission, MCP-interaction, and failure notifications still fire; only completion notifications are skipped.

Start the service:

```bash
pnpm dev
```

### 2. Install the Claude Code plugin

Create the config directory:

```bash
mkdir -p ~/.config/agent-notify
```

Copy the example and edit it (run from the project directory):

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/claude-code.json ~/.config/agent-notify/claude-code.json
```

The minimal config after copying:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

Configurable fields:

- `serverUrl`: required. The AgentNotify server URL.
- `token`: required. Only the part after the colon in `AGENT_NOTIFY_TOKENS`.
- `timeoutMs`: optional. Adapter request timeout in milliseconds, default `2000`.
- `debugLogPath`: optional. When set, the adapter writes every event it sees to this JSONL file, to help confirm whether a Claude Code hook actually fired. Off by default.

### 3. Install the Claude Code adapter file

Copy the example and edit it (run from the project directory):

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/claude-code-agent-notify.mjs ~/.config/agent-notify/claude-code-agent-notify.mjs
```

Claude Code settings should use the expanded absolute path rather than `~`. You can print it with:

```bash
printf '%s\n' "$HOME/.config/agent-notify/claude-code-agent-notify.mjs"
```

In the hook config below, replace `/ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs` with the path this command prints.

### 4. Configure Claude Code hooks

Merge the following into Claude Code's settings JSON. You can put it in user-level or project-level settings; if you already have a `hooks` section, just merge these four hooks in.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs"
          }
        ]
      }
    ]
  }
}
```

What these four hooks do:

- `UserPromptSubmit`: records the start time for long-task completion notifications; sends no notification.
- `Notification`: permission approval or MCP-interaction notification.
- `Stop`: pushes task-completion after `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` is met.
- `StopFailure`: notifies on task failure or quota errors.

You don't need a `matcher` on `Notification` — the adapter and server both ignore `idle_prompt` by default. To reduce how often Claude Code starts the adapter, you can add a matcher to `Notification`: `permission_prompt|elicitation_dialog|elicitation_complete|elicitation_response`.

After configuring, restart Claude Code so the settings take effect.

### 5. Verify Claude Code notifications

Make sure AgentNotify is running:

```bash
pnpm dev
```

Trigger an action that needs permission or a question choice in Claude Code. For example, tell Claude Code to mock a multi-select AskUserQuestion. Once the plugin catches it, it sends the event and a notification to AgentNotify.

To verify long-task completion notifications, temporarily lower the **server** threshold:

```bash
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=5
```

Restart the AgentNotify service and have Claude Code run a task longer than 5 seconds. You should get a completion notification when the task ends. Change the threshold back to your usual value, e.g. `120`, afterwards.

Unlike OpenCode, the Claude Code plugin itself cannot hold state. For long tasks, the server records this turn's start time in memory when it receives `UserPromptSubmit`; on `Stop` it checks whether `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` was met, then deletes that state; on `StopFailure` it also deletes the state and sends a failure notification. The `Notification` / `idle_prompt` that Claude Code may fire at the end of each turn is ignored by the adapter and server by default, to avoid duplicating the long-task completion notification. Stale state is cleaned up by a 24-hour TTL and a 1000-entry cap.

## Codex setup

Codex uses command hooks to call the plugin, same as Claude.

### 1. Confirm the server config

Make sure `.env` has the server token and the Bark / ntfy endpoint:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark or ntfy
BARK_ENDPOINT=https://api.day.app/your-device-key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120
```

Long-task completion notifications are on by default, threshold `120` seconds: only after a task runs longer than 120 seconds is a completion notification pushed when it ends.

To turn completion notifications off, set the threshold to `0`. With `0`, Codex's permission notifications still fire; only completion notifications are skipped.

Start the service:

```bash
pnpm dev
```

### 2. Create the Codex adapter config

Copy the example and edit it (run from the project directory):

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/codex.json ~/.config/agent-notify/codex.json
```

The minimal config after copying:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

Configurable fields:

- `serverUrl`: required. The AgentNotify server URL.
- `token`: required. Only the part after the colon in `AGENT_NOTIFY_TOKENS`.
- `timeoutMs`: optional. Adapter request timeout in milliseconds, default `2000`.
- `debugLogPath`: optional. When set, the adapter writes every event it sees to this JSONL file, to help confirm whether events reach the adapter. Off by default.

### 3. Install the Codex adapter file

Copy the example and edit it (run from the project directory):

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/codex-agent-notify.mjs ~/.config/agent-notify/codex-agent-notify.mjs
```

Print the absolute path:

```bash
printf '%s\n' "$HOME/.config/agent-notify/codex-agent-notify.mjs"
```

In the hook config below, replace `/ABS/PATH/.config/agent-notify/codex-agent-notify.mjs` with the path this command prints.

### 4. Configure Codex hooks

Merge the following into the user-level `~/.codex/hooks.json`. If you already have hooks configured, just merge these three events in.

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

On first install, or whenever the command path changes, Codex asks for authorization when it opens — choose review and trust this hook. Until trusted, Codex skips non-managed hooks.

### 5. Verify Codex notifications

Keep the AgentNotify service running:

```bash
pnpm dev
```

Lower Codex's permissions and trigger an action that needs approval, e.g. have it run a shell command that needs approval. You should get a notification titled `Approve permission` or `需要批准`.

Then run a task longer than `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS`. A completion notification fires when the task ends. Short tasks do not trigger completion notifications.

## Common commands

Local development:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run the build in production:

```bash
pnpm start
```

Run tests:

```bash
pnpm test
```

Check config and service health:

```bash
pnpm agent-notify doctor
```

Send a test notification:

```bash
pnpm agent-notify test
```

## Deploy the server with Docker

To deploy the server with Docker, set the env vars on the host first, then start:

```bash
export AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
export AGENT_NOTIFY_PROVIDER=bark
export BARK_ENDPOINT=https://api.day.app/your-device-key
docker compose -f deploy/docker/docker-compose.yml up --build
```

`docker-compose.yml` reads config from host env vars via `${VAR}`. All configurable options:

| Env var | Required | Default | Description |
| --- | --- | --- | --- |
| `AGENT_NOTIFY_TOKENS` | ✅ | — | Server token, format `name:token`, comma-separated for multiple |
| `AGENT_NOTIFY_PROVIDER` | no | `bark` | provider, `bark` or `ntfy` |
| `BARK_ENDPOINT` | required for Bark | — | Bark endpoint, required when `bark` |
| `NTFY_ENDPOINT` | required for ntfy | empty | ntfy topic URL, required when `ntfy` |
| `NTFY_TOKEN` | no | empty | Bearer token for a protected ntfy topic |
| `AGENT_NOTIFY_LANGUAGE` | no | `en` | notification text language, `en` or `zh` |
| `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` | no | `120` | Claude Code completion threshold, `0` disables |
| `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` | no | `120` | Codex completion threshold, `0` disables |
| `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` | no | `120` | OpenCode completion threshold, `0` disables |
| `AGENT_NOTIFY_LOG_RAW` | no | `false` | whether to log raw payloads; turn on temporarily for debugging |

These are fixed in `docker-compose.yml` and usually don't need changing:

- `AGENT_NOTIFY_HOST=0.0.0.0`, `AGENT_NOTIFY_PORT=8787`: in-container listen address; if changed, update the `ports` mapping too.
- `AGENT_NOTIFY_LOG_PATH=/data/events.jsonl`: logs go to the mounted volume.
- Port mapping `8787:8787`: host `8787` → container `8787`; change the left number on host port conflicts.
- Volume `agent-notify-data:/data`: persists logs; only `docker compose down -v` removes it.

With ntfy:

```bash
export AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
export AGENT_NOTIFY_PROVIDER=ntfy
export NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
# add this if the topic requires auth:
# export NTFY_TOKEN=your-ntfy-token
docker compose -f deploy/docker/docker-compose.yml up --build
```

The container has a healthcheck (probes `/health` every 30 seconds); `docker compose ps` shows the health status.

After the service starts, the host reaches it at:

```text
http://127.0.0.1:8787
```

Point your agent adapters / plugins on the host at this address. Note: `127.0.0.1` inside the container means the container itself; other host processes should use `http://127.0.0.1:8787` or the host IP. If the agent runs in another container, use the host IP or `host.docker.internal`.

The agent-side minimal config is the same, e.g. OpenCode:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

In Docker mode, logs live in the mounted volume and survive container rebuilds:

```bash
docker compose -f deploy/docker/docker-compose.yml exec agent-notify cat /data/events.jsonl
```

## Where logs live

Local mode default log file:

```text
./data/events.jsonl
```

In Docker mode, logs are in the mounted volume `/data/events.jsonl` (see "Deploy the server with Docker").

By default, the full raw payload is not logged because it may contain sensitive data. This is controlled by `AGENT_NOTIFY_LOG_RAW`:

```bash
AGENT_NOTIFY_LOG_RAW=false
```

Don't enable it unless you're debugging locally.

## Troubleshooting

### `pnpm agent-notify doctor` says `AGENT_NOTIFY_TOKENS` is missing

Check whether `.env` exists and contains:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

### `pnpm agent-notify doctor` says `BARK_ENDPOINT` is missing

When `AGENT_NOTIFY_PROVIDER` is `bark` (the default), a Bark endpoint is required. Check `.env`:

```bash
BARK_ENDPOINT=https://api.day.app/your-device-key
```

### `pnpm agent-notify doctor` says `NTFY_ENDPOINT` is missing

When `AGENT_NOTIFY_PROVIDER=ntfy`, an ntfy topic URL is required. Check `.env`:

```bash
AGENT_NOTIFY_PROVIDER=ntfy
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
```

Note that `NTFY_ENDPOINT` must include the full topic path; the topic name is the last segment.

### `server health unavailable`

The AgentNotify service isn't running, or the port is wrong.

Start the service first:

```bash
pnpm dev
```

Then:

```bash
pnpm agent-notify doctor
```

### `pnpm agent-notify test` reports `POST /events failed with HTTP 401`

Token mismatch. `agent-notify test` sends the request with the first token from `AGENT_NOTIFY_TOKENS`; an auth failure means the token list is empty or malformed. Confirm `.env`:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

The format is `name:token`; the colon is required.

### `pnpm agent-notify test` sends but no phone notification

`agent-notify test` sends a test event and prints `Test event sent through /events`, meaning the event reached the server; the problem is in the provider push step. Check in order:

1. Whether the provider's endpoint in `.env` is correct (`bark` → `BARK_ENDPOINT`, `ntfy` → `NTFY_ENDPOINT`).
2. Whether the Bark app / ntfy client subscribed to the right device or topic, and can receive the app's own plain test push.
3. Whether the AgentNotify service terminal printed errors.
4. Whether `data/events.jsonl` has a `provider_failed` record, and the failure reason (e.g. HTTP 4xx/5xx, network timeout).
5. ntfy extra checks: if the topic needs auth, is `NTFY_TOKEN` set and correct; is the public `ntfy.sh` topic name spelled consistently.

### Long-task completion notification not received

Completion notifications are on by default, threshold 120 seconds. When missing, check per agent:

- **OpenCode**: the threshold is the server `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` (default `120`). The time from session `busy` to `idle` must reach the threshold to push. Short tasks not pushing is expected. To verify, temporarily set `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` to `5` in the server `.env` and run a task longer than 5 seconds. If a turn already errored (`session.error`), a later `idle` won't push a completion notification.
- **Claude Code**: the threshold is the server `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` (default `120`). `UserPromptSubmit` must record the start time first for `Stop` to judge; if the `UserPromptSubmit` hook isn't configured or didn't fire, `Stop` has no start time and won't push a completion notification. Confirm all four hooks are configured. `StopFailure` clears the turn's state and sends a failure notification instead of a completion notification.
- **Codex**: the threshold is the server `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` (default `120`). It also relies on `UserPromptSubmit` recording the start time; confirm all three hooks are configured and Codex `/hooks` is trusted.

Tip: temporarily set the threshold to `5` and run a task clearly longer than 5 seconds — much faster than waiting 120. Change it back to `120` afterwards.

### No notification triggered in OpenCode

Check in order:

1. Whether `~/.config/opencode/agent-notify.json` exists.
2. Whether `token` equals the part after the colon in the server `.env` token.
3. Whether the plugin file was copied to the right directory.
4. Whether the AgentNotify service is running.
5. Whether the event you triggered is currently supported: a permission request, a question choice, a session error, or a session completion after the `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` threshold.

If you set `debugLogPath` in `agent-notify.json`, first check whether the plugin saw the event (use the path you configured):

```bash
tail -f ~/.config/opencode/agent-notify-debug.jsonl
```

Each line's `forwarded` indicates whether that event was forwarded to AgentNotify. For example, `message.updated`-type events may show up in the plugin log but won't currently trigger a phone notification. This file is local debugging data and may contain raw session info — don't share it directly; clean it up after debugging.

### No notification triggered in Claude Code

Check in order:

1. Whether the AgentNotify service is running.
2. Whether `~/.config/agent-notify/claude-code.json` exists.
3. Whether `token` equals the part after the colon in the server `.env` token.
4. Whether the Claude Code hooks command is `node /absolute/path/.config/agent-notify/claude-code-agent-notify.mjs`.
5. Whether the path in the command actually exists — check with `ls /absolute/path/.config/agent-notify/claude-code-agent-notify.mjs`.
6. Whether Claude Code has been restarted to re-read settings.

Test the adapter with a manual payload first:

```bash
printf '{"hook_event_name":"Notification","notification_type":"permission_prompt","session_id":"manual_debug","message":"AgentNotify debug"}' | node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs
```

Then check the adapter debug log:

```bash
tail -f ~/.config/agent-notify/claude-code-debug.jsonl
```

Common cases:

- No new logs: the Claude Code hook didn't execute, or the adapter config can't be read.
- `forwarded:false`: the current hook isn't an event AgentNotify supports.
- `forwarded:true` but `sent:false`: the request didn't reach AgentNotify — check the service is running, the token is correct, and the server terminal for errors.
- `sent:true` but no phone notification: check `data/events.jsonl` for `provider_failed`, and whether the provider endpoint is correct (Bark → `BARK_ENDPOINT`, ntfy → `NTFY_ENDPOINT`).

### No notification triggered in Codex

Check in order:

1. Whether the AgentNotify service is running.
2. Whether `~/.config/agent-notify/codex.json` exists, and `token` equals the part after the colon in the server `.env` token.
3. Whether all three events (`UserPromptSubmit`, `PermissionRequest`, `Stop`) are configured in `~/.codex/hooks.json`, and the command points to `node /absolute/path/.config/agent-notify/codex-agent-notify.mjs`.
4. Whether the command path actually exists: `ls /absolute/path/.config/agent-notify/codex-agent-notify.mjs`.
5. **Whether Codex `/hooks` has trusted this hook.** Until trusted, Codex skips non-managed hooks — this is the most common "configured but not working" cause with Codex. After the command path changes you must re-trust it too.
6. Whether `permission_mode` is `bypassPermissions` — in that mode `PermissionRequest` is not pushed (by design, not a bug).

Test the adapter with a manual payload first:

```bash
printf '{"hook_event_name":"PermissionRequest","session_id":"manual_debug","tool_name":"Bash","tool_input":{"command":"echo debug"}}' | node /ABS/PATH/.config/agent-notify/codex-agent-notify.mjs
```

Then check the adapter debug log (requires `debugLogPath` set in `codex.json`):

```bash
tail -f ~/.config/agent-notify/codex-debug.jsonl
```

Common cases are the same as Claude Code: no new logs means the hook didn't execute or the config can't be read; `forwarded:false` means it's not a supported event; `forwarded:true` but `sent:false` means it didn't reach the server; `sent:true` but no notification means the problem is the provider.

### Configured the token but still 401

The server config is:

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

The OpenCode plugin config should be:

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

Don't include `macbook:`.

## Security notes

- Don't commit `.env` — it contains tokens and endpoints.
- Don't share your Bark endpoint / ntfy topic URL / `NTFY_TOKEN` with anyone. The Bark endpoint equals push permission; a public ntfy topic means anyone can push to your device.
- Don't casually share `data/events.jsonl` or any adapter's `debugLogPath` logs — they may contain raw session info.
- `AGENT_NOTIFY_LOG_RAW=true` may log raw OpenCode / Claude Code / Codex events; turn it off after debugging.
