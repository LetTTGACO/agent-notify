# AgentNotify 人类使用手册

这份手册写给想给 OpenCode、Claude Code、Codex 接上手机或桌面通知的人。照着配置一遍，就能把关键事件转发到 AgentNotify，再由 Bark 或 ntfy 推到你的设备。

## 这个项目是做什么的

AgentNotify 是一个本地通知中转站：

1. OpenCode、Claude Code 或 Codex 运行到需要你处理的事件，例如请求命令权限、问题选择、长任务完成或会话报错。
2. 本地 adapter 把事件发到本机的 AgentNotify 服务。
3. AgentNotify 把事件格式化成简短通知。
4. AgentNotify 调用配置的 provider（Bark 或 ntfy），把通知推到你的手机或桌面设备。

当前版本主要支持这些 OpenCode 事件：

- `permission.v2.asked`：请求执行需要批准的操作时推送权限通知
- `permission.asked`：旧版权限请求，同上，推送权限通知
- `question.asked`：需要你在几个选项里做选择时推送，提醒你回来做选择
- `session.error`：会话报错时推送失败通知
- `session.idle`：记录会话生命周期，用于长任务才提醒功能用

也就是说，它不会把 OpenCode 的每一步都推给你，只会推需要你注意的事件。

Claude Code 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知，
- `Notification`：Claude Code 需要权限批准或处理 MCP 交互时推送；普通 `idle_prompt` 默认忽略
- `Stop`：长任务达到服务端完成阈值（默认 `120` 秒）后推送完成通知
- `StopFailure`：任务失败或限额错误时推送

Codex 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知
- `PermissionRequest`：Codex 需要用户批准权限时推送；`permission_mode` 为 `bypassPermissions` 时不推送
- `Stop`：长任务达到服务端完成阈值（默认 `120` 秒）后推送完成通知

## 手动通知开关

每个工具都有自己的 AgentNotify 开关。在 Codex 里关闭通知，不会影响 OpenCode 或 Claude Code。

命令：

- `/agent-notify off`：静音当前工具的当前会话。
- `/agent-notify on`：重新开启当前工具通知，并清掉当前会话、定时和持久静音。
- `/agent-notify off 30m`：将当前工具静音 30 分钟。支持的单位是 `s`、`m`、`h`、`d`。
- `/agent-notify off persist`：持久静音当前工具，直到执行 `/agent-notify on`。
- `/agent-notify status`：在 host 能显示命令输出时，显示当前工具开关状态。

adapter/plugin 负责识别有效命令并写入状态文件；对应的 `agent-notify` skill 只负责告诉 AI 这类命令应该如何简短回应，或在 `status` 时读取状态文件并说明当前状态。

开关状态存放在：

```text
~/.config/agent-notify/state/codex.json
~/.config/agent-notify/state/claude-code.json
~/.config/agent-notify/state/opencode.json
```

状态文件不存在、malformed 或 unreadable 时会按“已开启通知”处理，避免这类静音文件永久阻断通知。

静音优先级是 持久 > 定时 > 会话：持久静音会覆盖正在生效的定时静音，正在生效的定时静音会覆盖会话静音。

malformed 或 unreadable 的状态文件会默认把通知保持在开启状态。若配置了 debug 日志，这类读取错误会写入对应的 debug 日志，方便你在日志里看到这个回退。

## 交互冷却降噪

当你在电脑前连续处理多个权限或问答时，连发通知会很吵。AgentNotify 在服务端对 `permission` / `question` 类通知做冷却降噪：

- 同一 agent 会话内，第一个权限/问答通知正常推送。
- 之后的冷却窗口内（默认 `60` 秒），同一会话的同类通知被静默。
- 每个冷却事件都会刷新窗口，所以连续对话期间一直静默；只有你停手超过窗口长度，下一条才重新通知。

冷却按「token + agent + session」维度隔离，不同会话、不同 agent 互不影响；`completed` / `failed` 等完成态通知不进冷却（由各自的完成阈值节流）。缺 session 时放行，避免漏响首条。窗口可通过 `AGENT_NOTIFY_COOLDOWN_SECONDS` 调整，设为 `0` 关闭。

## 通知标题的项目名前缀

通知标题会在能够识别项目目录时自动加项目名前缀，例如 `agent-notify 需要批准`。Claude Code 和 Codex 使用 hook payload 里的 `cwd`；OpenCode 的插件会把当前项目目录补为转发事件的 `raw.cwd`，用于生成该前缀。无法识别目录时，标题保持原样。通知标题里的项目名前缀按会话首次出现的 cwd 固定；会话过程中 cwd 变化（例如 Claude Code 执行子任务时进入子目录）不会改变前缀。

## 通知方式：Bark 与 ntfy

AgentNotify 把事件格式化后，通过 provider 推到你的设备。当前支持两种 provider，用 `.env` 里的 `AGENT_NOTIFY_PROVIDER` 选择，默认 `bark`。

### Bark

[Bark](https://github.com/Finb/Bark) 是一个 iOS 专用推送 App。你在 iPhone 上装好 Bark，拿到设备 Key，AgentNotify 就能把通知推到 iPhone 和 Apple Watch。

- 官方服务 endpoint 形如 `https://api.day.app/你的设备Key`。
- 也可以自建 Bark 服务，填自建 endpoint。
- AgentNotify 会把 `time_sensitive` 的通知标记为 Bark 的 `timeSensitive` 级别，避免被专注模式静音；并带上分组、图标和声音字段。

Bark 只能推到苹果设备。如果你用 Android、Windows、Linux 或想在桌面收通知，选下面的 ntfy。

### ntfy

[ntfy](https://ntfy.sh/) 是一个跨平台推送服务，支持 Android、iOS、桌面（Windows / macOS / Linux）和网页客户端。你在任意客户端订阅一个 topic，AgentNotify 往这个 topic 发消息，所有订阅端都会收到。

- 用公开的 `https://ntfy.sh/` 时，topic 名称相当于共享密钥，请用难猜的随机串，例如 `https://ntfy.sh/agent_notify_long_random_text`。
- 也可以自建 ntfy 服务。
- topic 需要认证时，设置 `NTFY_TOKEN`（Bearer token）；公开 topic 可留空。
- AgentNotify 会把 `time_sensitive` 的通知用 ntfy 的最高优先级（`priority=4`）发送。

### 多平台适配一览

| 平台 / 设备 | Bark | ntfy |
| --- | --- | --- |
| iPhone / Apple Watch | ✅ 推荐 | ✅ |
| Android | ❌ | ✅ 推荐 |
| macOS 桌面 | ❌ | ✅ |
| Windows 桌面 | ❌ | ✅ |
| Linux 桌面 | ❌ | ✅ |
| 网页浏览器 | ❌ | ✅ |

选型建议：

- 只用苹果设备 → Bark，配置最简单。
- 跨平台、跨设备，或团队多人接收同一批通知 → ntfy，所有设备订阅同一 topic 即可。

两个 provider 都通过 `.env` 配置，详见第二步。一次只能启用一个 `AGENT_NOTIFY_PROVIDER`。

## 你需要准备什么

- Node.js 20 或更高版本
- pnpm
- OpenCode / Claude Code / Codex（至少一个）
- 通知 provider 二选一：
  - Bark：iPhone 上安装 Bark，拿到 endpoint（形如 `https://api.day.app/你的设备Key`）
  - ntfy：在手机或桌面 ntfy 客户端订阅一个专属自己的 topic，拿到 topic URL

## 第一步：安装依赖

在项目目录里执行：

```bash
pnpm install
```

## 第二步：配置 AgentNotify 服务端

复制示例环境变量：

```bash
cp .env.example .env
```

打开 `.env`，至少确认这几项：

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

你需要改的是：

- `AGENT_NOTIFY_PROVIDER`：通知 provider，默认 `bark`，也可以设为 `ntfy`。
- `BARK_ENDPOINT`：使用 Bark 时换成你的 Bark endpoint。
- `NTFY_ENDPOINT`：使用 ntfy 时填写完整 topic URL，例如 `https://ntfy.sh/agent_notify_long_random_text`
- `NTFY_TOKEN`：ntfy 受保护 topic 的可选 Bearer token；公开 topic 可留空。
- `AGENT_NOTIFY_LANGUAGE`：通知文案语言，支持 `en` 和 `zh`，默认 `en`。
- `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`：Claude Code 完成通知阈值，单位秒，默认 `120`。任务运行超过该秒数后，结束时推送完成通知；设为 `0` 关闭 Claude Code 完成通知。
- `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS`：Codex 完成通知阈值，单位秒，默认 `120`。任务运行超过该秒数后，结束时推送完成通知；设为 `0` 关闭 Codex 完成通知。
- `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS`：OpenCode 完成通知阈值，单位秒，默认 `120`。任务运行超过该秒数后，结束时推送完成通知；设为 `0` 关闭 OpenCode 完成通知。
- `AGENT_NOTIFY_COOLDOWN_SECONDS`：交互冷却窗口，单位秒，默认 `60`。连续权限/问答通知的冷却降噪窗口，设为 `0` 关闭。详见上文「交互冷却降噪」。

建议把 `dev-token-change-me` 改成只有你知道的字符串。例如：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

后面配置 OpenCode / Claude Code / Codex 插件时，各自 `json 配置文件` 里的 `token` 必须填同一个 token，也就是这里冒号后面的部分。

## 第三步：启动 AgentNotify

开发模式启动：

```bash
pnpm dev
```

看到类似输出就表示服务启动了：

```text
agent-notify listening on 0.0.0.0:8787
```

服务默认监听：

```text
http://127.0.0.1:8787
```

## 第四步：检查服务是否正常

另开一个终端，在项目目录里执行：

```bash
pnpm agent-notify doctor
```

正常时你会看到几行 `OK`，包括：

- 当前 provider（`bark` 或 `ntfy`）的 endpoint 配置存在
- 日志目录可写
- `/health` 能访问

再发一条测试事件：

```bash
pnpm agent-notify test
```

如果配置正确，你的手机应该收到一条测试通知。

## 第五步：接入你的 AI coding agent

三个 agent 全部接入后，新增的文件大致如下：

```text
~/.config/
├── agent-notify/                      
│   ├── claude-code.json               # Claude Code adapter 配置
│   ├── claude-code-agent-notify.mjs   # Claude Code adapter 文件
│   ├── codex.json                     # Codex adapter 配置
│   └── codex-agent-notify.mjs         # Codex adapter 文件
└── opencode/                          # OpenCode 目录
    ├── agent-notify.json              # OpenCode 插件配置
    ├── skills/
    │   └── agent-notify/
    │       └── SKILL.md               # OpenCode agent-notify skill
    └── plugins/
        └── agent-notify.ts            # OpenCode 插件文件
```

另外还会给 Claude Code 和 Codex 安装全局 skill：

```text
~/.claude/skills/agent-notify/SKILL.md
~/.codex/skills/agent-notify/SKILL.md
```

Claude Code 的 hooks 写在其配置文件中（用户级 `~/.claude/settings.json` 或项目级 `.claude/settings.json`）

Codex 的 hooks 写在 `~/.codex/hooks.json`

## OpenCode 接入

项目里已经提供了 OpenCode 插件示例：

```text
examples/opencode/agent-notify.ts
```

你可以二选一安装：

- 全局安装：复制到 `~/.config/opencode/plugins/`
- 只给当前项目安装：复制到当前项目的 `.opencode/plugins/`

全局安装：

```bash
mkdir -p ~/.config/opencode/plugins
cp examples/opencode/agent-notify.ts ~/.config/opencode/plugins/agent-notify.ts
```

### 1. 确认 AgentNotify 服务端配置

先确认 `.env` 里有服务端 token 和 Bark endpoint/Ntfy endpoint：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark 或者 ntfy
BARK_ENDPOINT=https://api.day.app/你的设备Key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
```

### 2. 安装 OpenCode 插件

OpenCode 插件会读取这个配置文件：

```text
~/.config/opencode/agent-notify.json
```

从示例复制一份再改（在本项目目录里执行）：

```bash
mkdir -p ~/.config/opencode
cp examples/opencode/agent-notify.json ~/.config/opencode/agent-notify.json
```

复制后的最小配置如下：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

- `serverUrl`：必填。AgentNotify 服务端地址。
- `token`：必填。必须和 `.env` 里 `AGENT_NOTIFY_TOKENS` 的 token 部分一致，也就是冒号后面的部分。
- `timeoutMs`：可选。插件请求超时时间，单位毫秒，默认 `2000`。
- `debugLogPath`：可选。配置后，OpenCode 插件会把自己看到的每个事件写进这个 JSONL 文件，包含原始 OpenCode 事件，方便排查事件是否进入插件。默认不填。

如果这个文件不存在、JSON 写坏了，或者缺少必填字段，插件会初始化失败。OpenCode 会把插件失败限制在插件边界内，不会因为 AgentNotify 配错就阻塞你的正常 OpenCode 工作。

### 3. 安装 OpenCode skill

OpenCode 的 `agent-notify` skill 默认放在全局 skills 目录：

```bash
mkdir -p ~/.config/opencode/skills/agent-notify
cp examples/opencode/skills/agent-notify/SKILL.md ~/.config/opencode/skills/agent-notify/SKILL.md
```

OpenCode 插件仍然负责注册 `/agent-notify` 命令并写入状态文件；skill 负责让 AI 在命令进入对话时按 AgentNotify 约定回应。

### 4. 验证 OpenCode 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

然后启动 OpenCode：

```bash
opencode
```

在 OpenCode 里触发一次需要权限的操作。例如对OpenCode说：随便mock一个question选项。插件捕捉到后，会向 AgentNotify 发送事件以及通知。

如果想验证长任务完成通知，可以在服务端 `.env` 里临时把 `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` 调低：

```
AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS=5
```

重启服务端后，让 OpenCode 跑一个超过 5 秒的任务。任务结束时应该收到完成通知。验证完改回 `120` 即可恢复默认阈值。

## Claude Code 接入

### 1. 确认 AgentNotify 服务端配置

先确认 `.env` 里有服务端 token 和 Bark endpoint/Ntfy endpoint：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark 或者 ntfy
BARK_ENDPOINT=https://api.day.app/你的设备Key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=120
```

长任务完成通知默认开启，阈值为 `120` 秒：任务运行超过 120 秒后，结束时才会推送完成通知。

如果想关掉完成通知，把阈值设为 `0`。设为 `0` 后，Claude Code 的权限、MCP 交互、失败通知仍然会发送，只是不再发送完成通知。

启动服务：

```bash
pnpm dev
```

### 2. 安装 Claude Code 插件

创建配置目录：

```bash
mkdir -p ~/.config/agent-notify
```

从示例复制一份再改（在本项目目录里执行）：

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/claude-code.json ~/.config/agent-notify/claude-code.json
```

复制后的最小配置长这样：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

可配置字段说明：

- `serverUrl`：必填。AgentNotify 服务地址。
- `token`：必填。只填 `.env` 里 `AGENT_NOTIFY_TOKENS` 冒号后面的部分。
- `timeoutMs`：可选。adapter 请求超时时间，单位是毫秒，默认 `2000`。
- `debugLogPath`：可选。配置后，adapter 会把自己看到的每个事件写进这个 JSONL 文件，方便确认 Claude Code hook 是否真的触发了。默认不填。

### 3. 安装 Claude Code adapter 文件

从示例复制一份再改（在本项目目录里执行）：：

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/claude-code-agent-notify.mjs ~/.config/agent-notify/claude-code-agent-notify.mjs
```

Claude Code settings 里建议使用展开后的绝对路径，而不是 `~`。你可以用下面的命令查看：

```bash
printf '%s\n' "$HOME/.config/agent-notify/claude-code-agent-notify.mjs"
```

后面的 hook 配置里，把 `/ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs` 换成这条命令输出的路径。

### 4. 安装 Claude Code skill

Claude Code 的 `agent-notify` skill 放在全局 skills 目录：

```bash
mkdir -p ~/.claude/skills/agent-notify
cp examples/claude-code/skills/agent-notify/SKILL.md ~/.claude/skills/agent-notify/SKILL.md
```

hook 负责识别 `/agent-notify` 命令并写入状态文件；skill 负责让 AI 在命令进入对话时按 AgentNotify 约定回应。

### 5. 配置 Claude Code hooks

把下面这段合并到 Claude Code 的 settings JSON 里。你可以放在用户级 settings，也可以放在项目级 settings；如果你已经有 `hooks` 配置，只需要把这四个 hook 合并进去。

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

这四个 hooks 的作用是：

- `UserPromptSubmit`：用于长任务完成通知时记录开始时间，不发通知。
- `Notification`：权限批准或 MCP 交互通知；
- `Stop`：达到 `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` 后通知任务完成
- `StopFailure`：任务失败或限额错误时通知

这里不要求给 `Notification` 配 `matcher`，adapter 和服务端都会默认忽略 `idle_prompt`。如果你想减少 Claude Code 启动 adapter 的次数，也可以给 `Notification` 额外加 matcher：`permission_prompt|elicitation_dialog|elicitation_complete|elicitation_response`。

配置完成后，重启 Claude Code，让 settings 生效。

### 6. 验证 Claude Code 通知

先确认 AgentNotify 服务正在运行：

```bash
pnpm dev
```

在 ClaudeCode 里触发一次需要权限/问题选择的操作。例如对ClaudeCode说：随便mock一个AskUserQuestion多选。插件捕捉到后，会向 AgentNotify 发送事件以及通知。

如果想验证长任务完成通知，可以临时把【服务端】阈值调低：

```bash
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=5
```

重启 AgentNotify 服务后，让 Claude Code 跑一个超过 5 秒的任务。任务结束时应该收到完成通知。验证完再把阈值改回你日常想要的值，例如 `120`。

和 OpenCode 不同的是。Claude Code 插件本身无法保存状态。长任务需要服务端收到 `UserPromptSubmit` 后在内存中记录本轮开始时间；
收到 `Stop` 后判断是否达到 `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`，然后删除该状态；
收到 `StopFailure` 后也会删除状态并发送失败通知。Claude Code 每轮结束后可能触发的 `Notification` / `idle_prompt` 会被 adapter 和服务端默认忽略，避免和长任务完成通知重复。异常残留由 24 小时 TTL 和 1000 条上限清理。

## Codex 接入

Codex 和 Claude 一样使用 command hooks 调用插件

### 1. 确认 AgentNotify 服务端配置

先确认 `.env` 里有服务端 token 和 Bark endpoint/Ntfy endpoint：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
AGENT_NOTIFY_PROVIDER=bark 或者 ntfy
BARK_ENDPOINT=https://api.day.app/你的设备Key
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120
```

长任务完成通知默认开启，阈值为 `120` 秒：任务运行超过 120 秒后，结束时才会推送完成通知。

如果想关掉完成通知，把阈值设为 `0`。设为 `0` 后，Codex 的权限通知仍然会发送，只是不再发送完成通知。

启动服务：

```bash
pnpm dev
```

### 2. 创建 Codex adapter 配置

从示例复制一份再改（在本项目目录里执行）：

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/codex.json ~/.config/agent-notify/codex.json
```

复制后的最小配置长这样：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

可配置字段说明：

- `serverUrl`：必填。AgentNotify 服务地址。
- `token`：必填。只填 `.env` 里 `AGENT_NOTIFY_TOKENS` 冒号后面的部分。
- `timeoutMs`：可选。adapter 请求超时时间，单位是毫秒，默认 `2000`。
- `debugLogPath`：可选。配置后，adapter 会把自己看到的每个事件写进这个 JSONL 文件，方便排查事件是否进入 adapter。默认不填。

### 3. 安装 Codex adapter 文件

从示例复制一份再改（在本项目目录里执行）：：

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/codex-agent-notify.mjs ~/.config/agent-notify/codex-agent-notify.mjs
```

查看绝对路径：

```bash
printf '%s\n' "$HOME/.config/agent-notify/codex-agent-notify.mjs"
```

后面的 hook 配置里，把 `/ABS/PATH/.config/agent-notify/codex-agent-notify.mjs` 换成这条命令输出的路径。

### 4. 安装 Codex skill

Codex 的 `agent-notify` skill 放在全局 skills 目录：

```bash
mkdir -p ~/.codex/skills/agent-notify
cp examples/codex/skills/agent-notify/SKILL.md ~/.codex/skills/agent-notify/SKILL.md
```

hook 负责识别 `/agent-notify` 命令并写入状态文件；skill 负责让 AI 在命令进入对话时按 AgentNotify 约定回应。

### 5. 配置 Codex hooks

把下面内容合并到用户级 `~/.codex/hooks.json`。如果你已经有 hooks 配置，只需要把三个事件合进去。

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

首次安装或 command 路径变化后，打开 Codex 时会请求授权，选择 review 并 trust 这条 hook。未 trust 前，Codex 会跳过非 managed hook。

### 6. 实际验证 Codex 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

调低 Codex 的权限，在 Codex 里触发一次需要权限的操作，例如让它运行需要审批的 shell 命令。你应该收到标题为 `Approve permission` 或 `需要批准` 的通知。

再运行一次超过 `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` 的任务。任务结束后会触发完成通知。短任务不会触发完成通知。

## 常用命令

本地开发：

```bash
pnpm dev
```

构建：

```bash
pnpm build
```

生产方式运行构建结果：

```bash
pnpm start
```

运行测试：

```bash
pnpm test
```

检查配置和服务健康：

```bash
pnpm agent-notify doctor
```

发送测试通知：

```bash
pnpm agent-notify test
```

## 用 Docker 部署服务端

如果你想用 Docker 部署服务端，先在宿主机设置环境变量，再启动：

```bash
export AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
export AGENT_NOTIFY_PROVIDER=bark
export BARK_ENDPOINT=https://api.day.app/你的设备Key
docker compose -f deploy/docker/docker-compose.yml up --build
```

`docker-compose.yml` 用 `${VAR}` 从宿主机环境变量读取配置，下面是全部可配置项：

| 环境变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AGENT_NOTIFY_TOKENS` | ✅ | — | 服务端 token，格式 `名称:token`，多个用逗号分隔 |
| `AGENT_NOTIFY_PROVIDER` | 否 | `bark` | provider，`bark` 或 `ntfy` |
| `BARK_ENDPOINT` | Bark 时必填 | — | Bark endpoint，`bark` 时必填 |
| `NTFY_ENDPOINT` | ntfy 时必填 | 空 | ntfy topic URL，`ntfy` 时必填 |
| `NTFY_TOKEN` | 否 | 空 | ntfy 受保护 topic 的 Bearer token |
| `AGENT_NOTIFY_LANGUAGE` | 否 | `en` | 通知文案语言，`en` 或 `zh` |
| `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` | 否 | `120` | Claude Code 完成通知阈值，`0` 关闭 |
| `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` | 否 | `120` | Codex 完成通知阈值，`0` 关闭 |
| `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` | 否 | `120` | OpenCode 完成通知阈值，`0` 关闭 |
| `AGENT_NOTIFY_LOG_RAW` | 否 | `false` | 是否记录原始 raw payload，排查时临时开启 |

下面几项在 `docker-compose.yml` 里固定，一般不需要改：

- `AGENT_NOTIFY_HOST=0.0.0.0`、`AGENT_NOTIFY_PORT=8787`：容器内监听地址，改了要同步改 `ports` 映射。
- `AGENT_NOTIFY_LOG_PATH=/data/events.jsonl`：日志写到挂载卷。
- 端口映射 `8787:8787`：宿主机 `8787` → 容器 `8787`，宿主机端口冲突时改左边的数字。
- 挂载卷 `agent-notify-data:/data`：持久化日志，`docker compose down -v` 才会删。

用 ntfy 时：

```bash
export AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
export AGENT_NOTIFY_PROVIDER=ntfy
export NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
# topic 需要认证时再加：
# export NTFY_TOKEN=your-ntfy-token
docker compose -f deploy/docker/docker-compose.yml up --build
```

容器带 healthcheck（每 30 秒探一次 `/health`），`docker compose ps` 能看到健康状态。

服务启动后，宿主机访问：

```text
http://127.0.0.1:8787
```

宿主机内的 agent adapter / 插件指向这个地址即可。注意：容器内是 `127.0.0.1` 指容器自己，宿主机上其它进程要用 `http://127.0.0.1:8787` 或宿主机 IP；如果 agent 跑在另一个容器里，要用宿主机 IP 或 `host.docker.internal`。

各 agent 侧的最小配置不变，例如 OpenCode：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

Docker 模式下日志在挂载卷里，容器重建不丢：

```bash
docker compose -f deploy/docker/docker-compose.yml exec agent-notify cat /data/events.jsonl
```

## 日志在哪里

本地模式默认日志文件：

```text
./data/events.jsonl
```

Docker 模式下日志在挂载卷 `/data/events.jsonl`（详见「用 Docker 部署服务端」）。

日志默认不记录完整 raw payload，因为里面可能有敏感信息。这个行为由 `AGENT_NOTIFY_LOG_RAW` 控制：

```bash
AGENT_NOTIFY_LOG_RAW=false
```

除非你在本地排查问题，否则不建议打开。

## 错误排查

### `pnpm agent-notify doctor` 提示缺少 `AGENT_NOTIFY_TOKENS`

检查 `.env` 是否存在，以及里面是否有：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

### `pnpm agent-notify doctor` 提示缺少 `BARK_ENDPOINT`

`AGENT_NOTIFY_PROVIDER` 是 `bark`（默认）时必须有 Bark endpoint。检查 `.env`：

```bash
BARK_ENDPOINT=https://api.day.app/你的设备Key
```

### `pnpm agent-notify doctor` 提示缺少 `NTFY_ENDPOINT`

`AGENT_NOTIFY_PROVIDER=ntfy` 时必须有 ntfy topic URL。检查 `.env`：

```bash
AGENT_NOTIFY_PROVIDER=ntfy
NTFY_ENDPOINT=https://ntfy.sh/agent_notify_long_random_text
```

注意 `NTFY_ENDPOINT` 要带完整 topic 路径，topic 名是最后一段。

### `server health unavailable`

说明 AgentNotify 服务没有启动，或者端口不对。

先启动服务：

```bash
pnpm dev
```

再执行：

```bash
pnpm agent-notify doctor
```

### `pnpm agent-notify test` 报 `POST /events failed with HTTP 401`

token 不匹配。`agent-notify test` 用 `.env` 里 `AGENT_NOTIFY_TOKENS` 第一个 token 发请求；服务端鉴权失败说明 token 列表为空或格式错。确认 `.env`：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

格式是 `名称:token`，冒号不能少。

### `pnpm agent-notify test` 没有收到手机通知

`agent-notify test` 会发一条测试事件并打印 `Test event sent through /events`，说明事件已进入服务端，问题在 provider 推送环节。按顺序检查：

1. `.env` 里 provider 对应的 endpoint 是否正确（`bark` 看 `BARK_ENDPOINT`，`ntfy` 看 `NTFY_ENDPOINT`）。
2. Bark app / ntfy 客户端是否订阅了对应设备或 topic，能否收到该 App 自己发的普通测试推送。
3. AgentNotify 服务终端有没有报错。
4. `data/events.jsonl` 里有没有 `provider_failed` 记录，看失败原因（如 HTTP 4xx/5xx、网络超时）。
5. ntfy 额外检查：topic 需要认证时是否配了 `NTFY_TOKEN`，token 是否正确；公开 `ntfy.sh` 的 topic 名是否拼写一致。

### 长任务完成通知没收到

完成通知默认开启，阈值 120 秒。没收到时按 agent 区分检查：

- **OpenCode**：完成阈值在服务端 `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS`（默认 `120`）。会话从 `busy` 到 `idle` 的耗时必须达到阈值才会推。短任务不推是正常的。验证时可临时把服务端 `.env` 的 `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` 设为 `5`，跑一个超过 5 秒的任务。同一轮如果先报错（`session.error`），后续 `idle` 不会再推完成通知。
- **Claude Code**：阈值在服务端 `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`（默认 `120`）。必须 `UserPromptSubmit` 先记录本轮开始时间，`Stop` 时才判断；如果 `UserPromptSubmit` hook 没配或没触发，`Stop` 就没有起始时间，不会推完成通知。确认四个 hook 都配了。`StopFailure` 会清掉本轮状态并发失败通知，不再发完成通知。
- **Codex**：阈值在服务端 `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS`（默认 `120`）。同样依赖 `UserPromptSubmit` 记录开始时间，确认三个 hook 都配了且 Codex `/hooks` 已 trust。

排查技巧：把阈值临时调到 `5`，跑一个明显超过 5 秒的任务，比等 120 秒快得多。验证完改回 `120`。

### OpenCode 里没有触发通知

按顺序检查：

1. `~/.config/opencode/agent-notify.json` 是否存在。
2. `token` 是否等于服务端 `.env` 里 token 的冒号后半段。
3. 插件文件是否复制到了正确目录。
4. AgentNotify 服务是否正在运行。
5. 你触发的是否是当前支持的事件：权限请求、问题选择、会话错误，或达到 `AGENT_NOTIFY_OPENCODE_COMPLETION_MIN_SECONDS` 阈值后的会话完成。

如果你在 `agent-notify.json` 里配了 `debugLogPath`，先看插件端是否看到了事件（路径换成你配的那个）：

```bash
tail -f ~/.config/opencode/agent-notify-debug.jsonl
```

每行里的 `forwarded` 表示该事件是否被转发给 AgentNotify。比如 `message.updated` 这类事件可能会出现在插件端日志里，但当前不会触发手机通知。这个文件是本地排障数据，可能包含原始会话信息，不要直接分享；排查完可以手动清理。

### Claude Code 里没有触发通知

按顺序检查：

1. AgentNotify 服务是否正在运行。
2. `~/.config/agent-notify/claude-code.json` 是否存在。
3. `token` 是否等于服务端 `.env` 里 token 的冒号后半段。
4. Claude Code hooks 里的 command 是否是 `node /绝对路径/.config/agent-notify/claude-code-agent-notify.mjs`。
5. command 里的路径是否真实存在，可以用 `ls /绝对路径/.config/agent-notify/claude-code-agent-notify.mjs` 检查。
6. Claude Code 是否已经重启并重新读取 settings。

先用手动 payload 测试 adapter：

```bash
printf '{"hook_event_name":"Notification","notification_type":"permission_prompt","session_id":"manual_debug","message":"AgentNotify debug"}' | node /ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs
```

再看 adapter debug log：

```bash
tail -f ~/.config/agent-notify/claude-code-debug.jsonl
```

常见情况：

- 没有新日志：Claude Code hook 没有执行，或 adapter config 读不到。
- `forwarded:false`：当前 hook 不是 AgentNotify 支持的事件。
- `forwarded:true` 但 `sent:false`：请求没有成功送到 AgentNotify，检查服务是否启动、token 是否正确、服务端终端是否报错。
- `sent:true` 但手机没收到：检查 `data/events.jsonl` 是否有 `provider_failed`，以及 provider endpoint 是否正确（Bark 看 `BARK_ENDPOINT`，ntfy 看 `NTFY_ENDPOINT`）。

### Codex 里没有触发通知

按顺序检查：

1. AgentNotify 服务是否正在运行。
2. `~/.config/agent-notify/codex.json` 是否存在，`token` 是否等于服务端 `.env` 里 token 的冒号后半段。
3. `~/.codex/hooks.json` 里三个事件（`UserPromptSubmit`、`PermissionRequest`、`Stop`）是否都配了，command 是否指向 `node /绝对路径/.config/agent-notify/codex-agent-notify.mjs`。
4. command 路径是否真实存在：`ls /绝对路径/.config/agent-notify/codex-agent-notify.mjs`。
5. **Codex `/hooks` 是否已经 trust 这条 hook**。未 trust 前 Codex 会跳过非 managed hook，这是 Codex 最常见的「配了但不生效」原因。command 路径变化后也需要重新 trust。
6. `permission_mode` 是否为 `bypassPermissions`——这种模式下 `PermissionRequest` 不会推送（设计如此，不是 bug）。

先用手动 payload 测试 adapter：

```bash
printf '{"hook_event_name":"PermissionRequest","session_id":"manual_debug","tool_name":"Bash","tool_input":{"command":"echo debug"}}' | node /ABS/PATH/.config/agent-notify/codex-agent-notify.mjs
```

再看 adapter debug log（需先在 `codex.json` 配 `debugLogPath`）：

```bash
tail -f ~/.config/agent-notify/codex-debug.jsonl
```

常见情况和 Claude Code 一致：没有新日志说明 hook 没执行或 config 读不到；`forwarded:false` 说明不是支持的事件；`forwarded:true` 但 `sent:false` 说明没送到服务端；`sent:true` 但没收到说明问题在 provider。

### token 配了还是 401

服务端配置是：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

OpenCode 插件配置应该是：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

不要把 `macbook:` 一起填进去。

## 安全提醒

- 不要提交 `.env`，里面含 token 和 endpoint。
- 不要把 Bark endpoint / ntfy topic URL / `NTFY_TOKEN` 发给别人。Bark endpoint 等于推送权限，公开 ntfy topic 等于任何人都能往你设备发通知。
- 不要随便分享 `data/events.jsonl` 和各 adapter 的 `debugLogPath` 日志，里面可能含原始会话信息。
- `AGENT_NOTIFY_LOG_RAW=true` 可能记录 OpenCode / Claude Code / Codex 原始事件，排查完问题后建议关掉。
