# AgentNotify 人类使用手册

这份手册写给“想在 OpenCode、Claude Code 或 Codex 里收到手机通知”的人。你不需要先读源码；照着走一遍，就能把 AI coding agent 的关键事件转发到 AgentNotify，再由 Bark 推送到 iPhone 或 Apple Watch。

## 这个项目是做什么的

AgentNotify 是一个本地通知中转站：

1. OpenCode、Claude Code 或 Codex 运行到需要你处理的事件，例如请求命令权限、问题选择、长任务完成或会话报错。
2. 本地 adapter 把事件发到本机的 AgentNotify 服务。
3. AgentNotify 把事件格式化成简短通知。
4. AgentNotify 调用 Bark，把通知推到你的 iPhone / Apple Watch。

当前版本主要支持这些 OpenCode 事件：

- `permission.v2.asked`
- `permission.asked`
- `question.asked`
- `session.error`
- `session.idle`：本轮耗时达到完成阈值（默认 `120` 秒，可在插件配置 `completionMinSeconds` 调整）时转发

也就是说，它不会把 OpenCode 的每一步都推给你，只会推需要你注意的事件。

Claude Code 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知
- `Notification`：Claude Code 需要权限批准或处理 MCP 交互时推送；普通 `idle_prompt` 默认忽略
- `Stop`：长任务达到服务端完成阈值（默认 `120` 秒）后推送完成通知
- `StopFailure`：任务失败或限额错误时推送

Codex 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知
- `PermissionRequest`：Codex 需要用户批准权限时推送；`permission_mode` 为 `bypassPermissions` 时不推送
- `Stop`：长任务达到服务端完成阈值（默认 `120` 秒）后推送完成通知

## 你需要准备什么

- Node.js 20 或更高版本
- pnpm
- OpenCode
- iPhone 上安装 Bark，并拿到 Bark endpoint

Bark endpoint 通常长这样：

```bash
https://api.day.app/你的设备Key
```

如果你使用自建 Bark 服务，也可以填你的自建 endpoint。

如果你使用 ntfy：

1. 在手机或桌面 ntfy 客户端订阅同一个 topic。
2. public `ntfy.sh` 的 topic 名称相当于共享密钥，请使用难猜的名称。
3. 自建 ntfy 且 topic 需要认证时，设置 `NTFY_TOKEN`。

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

- Bark endpoint 配置存在
- 日志目录可写
- `/health` 能访问

再发一条测试事件：

```bash
pnpm agent-notify test
```

如果配置正确，你的手机应该收到一条测试通知。

## 第五步：接入你的 AI coding agent

三个 agent 全部接入后，本机新增的文件大致如下：

```text
~/.config/
├── agent-notify/                      
│   ├── claude-code.json               # Claude Code adapter 配置
│   ├── claude-code-agent-notify.mjs   # Claude Code adapter 文件
│   ├── codex.json                     # Codex adapter 配置
│   └── codex-agent-notify.mjs         # Codex adapter 文件
└── opencode/                          # OpenCode 目录
    ├── agent-notify.json              # OpenCode 插件配置
    └── plugins/
        └── agent-notify.ts            # OpenCode 插件文件
```

Claude Code 的 hooks 写在其配置文件中（用户级 `~/.claude/settings.json` 或项目级 `.claude/settings.json`）

Codex 的 hooks 写在 `~/.codex/hooks.json`，这两处只存指向上面 adapter 文件的 command，不会复制 adapter 本身。

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

从示例复制一份再改（在 AgentNotify 项目目录里执行）：

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
- `completionMinSeconds`：可选，默认 `120`（即默认开启）。会话耗时达到该秒数后，任务完成才发送一次完成通知；设为 `0` 关闭完成通知。
- `timeoutMs`：可选。插件请求超时时间，单位毫秒，默认 `2000`。
- `debugLogPath`：可选。配置后，OpenCode 插件会把自己看到的每个事件写进这个 JSONL 文件，包含原始 OpenCode 事件，方便排查事件是否进入插件。默认不填。

如果这个文件不存在、JSON 写坏了，或者缺少必填字段，插件会初始化失败。OpenCode 会把插件失败限制在插件边界内，不会因为 AgentNotify 配错就阻塞你的正常 OpenCode 工作。

### 3. 验证 OpenCode 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

然后启动 OpenCode：

```bash
opencode
```

在 OpenCode 里触发一次需要权限的操作。例如对OpenCode说：随便mock一个question选项。插件捕捉到后，会向 AgentNotify 发送事件以及通知。

如果想验证长任务完成通知，可以在 `~/.config/opencode/agent-notify.json` 里临时加一行把阈值调低：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token",
  "completionMinSeconds": 5
}
```

重启 OpenCode 后，让 OpenCode 跑一个超过 5 秒的任务。任务结束时应该收到完成通知。验证完删掉这行（或改回 `120`）即可恢复默认阈值。

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

从示例复制一份再改（在 AgentNotify 项目目录里执行）：

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

在 AgentNotify 项目目录里执行：

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/claude-code-agent-notify.mjs ~/.config/agent-notify/claude-code-agent-notify.mjs
```

Claude Code settings 里建议使用展开后的绝对路径，而不是 `~`。你可以用下面的命令查看：

```bash
printf '%s\n' "$HOME/.config/agent-notify/claude-code-agent-notify.mjs"
```

后面的 hook 配置里，把 `/ABS/PATH/.config/agent-notify/claude-code-agent-notify.mjs` 换成这条命令输出的路径。

### 4. 配置 Claude Code hooks

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

### 5. 验证 Claude Code 通知

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

从示例复制一份再改（在 AgentNotify 项目目录里执行）：

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

在 AgentNotify 项目目录里执行：

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/codex-agent-notify.mjs ~/.config/agent-notify/codex-agent-notify.mjs
```

查看绝对路径：

```bash
printf '%s\n' "$HOME/.config/agent-notify/codex-agent-notify.mjs"
```

后面的 hook 配置里，把 `/ABS/PATH/.config/agent-notify/codex-agent-notify.mjs` 换成这条命令输出的路径。

### 4. 配置 Codex hooks

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

首次安装或 command 路径变化后，打开 Codex 的 `/hooks`，review 并 trust 这条 hook。未 trust 前，Codex 会跳过非 managed hook。

### 5. 实际验证 Codex 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

在 Codex 里触发一次需要权限的操作，例如让它运行需要审批的 shell 命令。你应该收到标题为 `Approve permission` 或 `需要批准` 的通知。

再运行一次超过 `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` 的任务。任务结束后，`Stop` hook 会触发完成通知。短任务不会触发完成通知。

如果没有通知，先检查：

- AgentNotify 服务是否在运行。
- `~/.config/agent-notify/codex.json` 里的 token 是否和服务端一致。
- Codex `/hooks` 是否已经 trust 这条 hook。
- `debugLogPath` 是否写入了 adapter 看到的事件。

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

## 用 Docker 跑

如果你想用 Docker 跑服务：

```bash
export AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
export BARK_ENDPOINT=https://api.day.app/你的设备Key
docker compose -f deploy/docker/docker-compose.yml up --build
```

Docker 默认把服务暴露到宿主机的 `8787` 端口：

```text
http://127.0.0.1:8787
```

OpenCode 侧仍然使用同一个插件配置文件（最小配置）：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token"
}
```

## 日志在哪里

默认日志文件：

```text
./data/events.jsonl
```

Docker 模式下日志在容器的：

```text
/data/events.jsonl
```

日志默认不记录完整 raw payload，因为里面可能有敏感信息。这个行为由下面的配置控制：

```bash
AGENT_NOTIFY_LOG_RAW=false
```

除非你在本地排查问题，否则不建议打开。

## 排错

### `pnpm agent-notify doctor` 提示缺少 `AGENT_NOTIFY_TOKENS`

检查 `.env` 是否存在，以及里面是否有：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

### `pnpm agent-notify doctor` 提示缺少 `BARK_ENDPOINT`

检查 `.env` 是否有你的 Bark endpoint：

```bash
BARK_ENDPOINT=https://api.day.app/你的设备Key
```

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

### `pnpm agent-notify test` 没有收到手机通知

按顺序检查：

1. `.env` 里的 `BARK_ENDPOINT` 是否正确。
2. Bark app 是否还能收到普通测试推送。
3. AgentNotify 服务终端有没有报错。
4. `data/events.jsonl` 里有没有 `provider_failed`。

### OpenCode 里没有触发通知

按顺序检查：

1. `~/.config/opencode/agent-notify.json` 是否存在。
2. `token` 是否等于服务端 `.env` 里 token 的冒号后半段。
3. 插件文件是否复制到了正确目录。
4. AgentNotify 服务是否正在运行。
5. 你触发的是否是当前支持的事件：权限请求、问题选择、会话错误，或达到 `completionMinSeconds` 阈值后的会话完成。

如果你配置了 `debugLogPath`，先看插件端是否看到了事件：

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
- `sent:true` 但手机没收到：检查 `data/events.jsonl` 是否有 `provider_failed`，以及 Bark endpoint 是否正确。

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

- 不要提交 `.env`。
- 不要把 Bark endpoint 发给别人。
- 不要随便分享 `data/events.jsonl`。
- `AGENT_NOTIFY_LOG_RAW=true` 可能记录 OpenCode 原始事件，排查完问题后建议关掉。

## 推荐的日常使用方式

日常使用时，可以保持一个终端专门跑 AgentNotify：

```bash
cd /ABS/PATH/agent-notify
pnpm dev
```

另一个终端进入你真正工作的代码项目，直接启动 OpenCode：

```bash
opencode
```

这样 OpenCode 遇到权限请求、问题选择或会话错误时，你就会在手机和手表上收到提醒。
