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
- `session.idle`：仅在插件配置了 `completionMinSeconds` 且本轮耗时达到阈值时转发

也就是说，它不会把 OpenCode 的每一步都推给你，只会推需要你注意的事件。

Claude Code 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知
- `Notification`：Claude Code 需要权限批准或处理 MCP 交互时推送；普通 `idle_prompt` 默认忽略
- `Stop`：长任务达到服务端阈值后推送完成通知
- `StopFailure`：任务失败或限额错误时推送

Codex 侧支持这些 hooks：

- `UserPromptSubmit`：只用于服务端记录本轮开始时间，不推送手机通知
- `PermissionRequest`：Codex 需要用户批准权限时推送；`permission_mode` 为 `bypassPermissions` 时不推送
- `Stop`：长任务达到服务端阈值后推送完成通知

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
- `NTFY_ENDPOINT`：使用 ntfy 时填写完整 topic URL，例如 `https://ntfy.sh/agent_notify_xxx`。
- `NTFY_TOKEN`：ntfy 受保护 topic 的可选 Bearer token；公开 topic 可留空。
- `AGENT_NOTIFY_LANGUAGE`：通知文案语言，支持 `en` 和 `zh`，默认 `en`。
- `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`：Claude Code 完成通知阈值，单位秒。设为 `0` 表示不推送 Claude Code 完成通知。
- `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS`：Codex 完成通知阈值，单位秒。设为 `0` 表示不推送 Codex 完成通知。

建议把 `dev-token-change-me` 改成只有你知道的字符串。例如：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

后面配置 OpenCode 插件时，`agent-notify.json` 里的 `token` 必须填同一个 token，也就是这里冒号后面的部分。

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

## 第五步：把插件装进 OpenCode

项目里已经提供了 OpenCode 插件示例：

```text
examples/opencode/agent-notify.ts
```

你可以二选一安装：

- 全局安装：复制到 `~/.config/opencode/plugins/`
- 只给当前项目安装：复制到当前项目的 `.opencode/plugins/`

例如全局安装：

```bash
mkdir -p ~/.config/opencode/plugins
cp examples/opencode/agent-notify.ts ~/.config/opencode/plugins/agent-notify.ts
```

例如只给某个项目安装：

```bash
mkdir -p .opencode/plugins
cp /ABS/PATH/agent-notify/examples/opencode/agent-notify.ts .opencode/plugins/agent-notify.ts
```

注意：第二种命令要在你准备用 OpenCode 工作的目标项目里执行。

## 第六步：配置 OpenCode 插件

OpenCode 插件会读取这个配置文件：

```text
~/.config/opencode/agent-notify.json
```

创建配置文件：

```bash
mkdir -p ~/.config/opencode
```

文件内容：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token",
  "timeoutMs": 2000,
  "completionMinSeconds": 120,
  "debugLogPath": "/ABS/PATH/.config/opencode/agent-notify-debug.jsonl"
}
```

其中：

- `serverUrl`：AgentNotify 服务地址。
- `token`：必须等于 `.env` 里 `AGENT_NOTIFY_TOKENS` 的 token 部分。
- `timeoutMs`：插件请求超时时间，单位是毫秒。
- `completionMinSeconds`：可选。大于 `0` 时，OpenCode 会话从 `busy` 到 `idle` 的耗时达到这个秒数后，才发送一次完成通知；不配置或设为 `0` 时，不发送完成通知。
- `debugLogPath`：可选。配置后，OpenCode 插件会把自己看到的每个事件写进这个 JSONL 文件，包含原始 OpenCode 事件，方便排查事件是否进入插件。

如果这个文件不存在、JSON 写坏了，或者缺少字段，插件会初始化失败。OpenCode 会把插件失败限制在插件边界内，不会因为 AgentNotify 配错就阻塞你的正常 OpenCode 工作。

## 第七步：实际验证 OpenCode 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

然后启动 OpenCode：

```bash
opencode
```

在 OpenCode 里触发一次需要权限的操作。例如让它执行一个需要确认的 shell 命令。插件捕捉到 `permission.v2.asked` 或 `permission.asked` 后，会向 AgentNotify 发送事件，AgentNotify 再发 Bark 通知。

如果 OpenCode 需要你在几个选项里做选择，插件捕捉到 `question.asked` 后也会发送通知。

如果你配置了 `completionMinSeconds`，OpenCode 进入 `busy` 后运行时间达到阈值，并随后触发 `session.idle` 时，也会收到一条完成通知。短对话、未达到阈值的运行、以及同一轮已经报错后的 `idle` 不会触发完成通知。

收到通知时，大致会是：

```text
Approve bash
pnpm test
```

如果 `.env` 设置了 `AGENT_NOTIFY_LANGUAGE=zh`，同一类通知会显示为：

```text
批准运行命令
pnpm test
```

如果 OpenCode 会话报错，你会收到标题为 `Failed` 的通知。

## Claude Code 接入

Claude Code 使用 command hooks 调用示例 adapter。这个 adapter 不进入正式 CLI；
它只负责读取 Claude Code hook stdin，并把事件包装成现有 `/events` 请求。
长任务完成阈值由 AgentNotify 服务端记录和判断。

### 1. 确认 AgentNotify 服务端配置

先确认 `.env` 里有服务端 token 和 Bark endpoint：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
BARK_ENDPOINT=https://api.day.app/你的设备Key
```

如果你想收到 Claude Code 长任务完成通知，再设置一个阈值。例如任务运行超过 120 秒后，`Stop` 才会推送完成通知：

```bash
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=120
```

如果设为 `0` 或不配置，Claude Code 的权限、MCP 交互、失败通知仍然会发送，但不会发送完成通知。

启动服务：

```bash
pnpm dev
```

### 2. 创建 Claude Code adapter 配置

创建配置目录：

```bash
mkdir -p ~/.config/agent-notify
```

创建 `~/.config/agent-notify/claude-code.json`：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token",
  "timeoutMs": 2000,
  "debugLogPath": "/ABS/PATH/.config/agent-notify/claude-code-debug.jsonl"
}
```

这里的 `token` 只填 `.env` 里 `AGENT_NOTIFY_TOKENS` 冒号后面的部分。比如服务端是：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

Claude Code adapter 配置里就填：

```bash
"token": "my-long-random-token"
```

不要把 `macbook:` 一起填进去。

`debugLogPath` 是可选的。建议刚接入时先保留，方便确认 Claude Code hook 是否真的触发了。

### 3. 安装 Claude Code adapter 文件

推荐把 adapter 复制到稳定的 AgentNotify 配置目录，再让 Claude Code hooks 指向这个复制后的文件。这样仓库切分支、更新 examples 或移动项目目录时，Claude Code 配置不会跟着失效。

在 AgentNotify 项目目录里执行：

```bash
mkdir -p ~/.config/agent-notify
cp examples/claude-code/agent-notify.mjs ~/.config/agent-notify/agent-notify.mjs
```

然后确认复制后的文件存在：

```bash
ls ~/.config/agent-notify/agent-notify.mjs
```

Claude Code settings 里建议使用展开后的绝对路径，而不是 `~`。你可以用下面的命令查看：

```bash
printf '%s\n' "$HOME/.config/agent-notify/agent-notify.mjs"
```

后面的 hook 配置里，把 `/ABS/PATH/.config/agent-notify/agent-notify.mjs` 换成这条命令输出的路径。

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

这四个 hooks 的作用是：

- `UserPromptSubmit`：记录本轮开始时间，不发通知
- `Notification`：权限批准或 MCP 交互通知；普通 `idle_prompt` 不通知
- `Stop`：达到 `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS` 后通知任务完成
- `StopFailure`：任务失败或限额错误时通知

这里不要求给 `Notification` 配 `matcher`，adapter 和服务端都会默认忽略 `idle_prompt`。如果你想减少 Claude Code 启动 adapter 的次数，也可以给 `Notification` 额外加 matcher：`permission_prompt|elicitation_dialog|elicitation_complete|elicitation_response`。

配置完成后，重启 Claude Code，让 settings 生效。

### 5. 验证 Claude Code adapter

先确认 AgentNotify 服务正在运行：

```bash
pnpm dev
```

然后可以用一条手动 hook payload 测试 adapter 是否能连到服务端。把命令里的 adapter 路径换成你的绝对路径：

```bash
printf '{"hook_event_name":"Notification","notification_type":"permission_prompt","session_id":"manual_test","message":"AgentNotify manual test"}' | node /ABS/PATH/.config/agent-notify/agent-notify.mjs
```

如果配置正确，你应该会收到一条手机通知。也可以看 adapter debug log：

```bash
tail -f ~/.config/agent-notify/claude-code-debug.jsonl
```

正常转发时，每行里会有类似字段：

```json
{"forwarded":true,"sent":true,"hookEventName":"Notification","sessionId":"manual_test"}
```

如果 `forwarded` 是 `true` 但 `sent` 是 `false`，通常说明 AgentNotify 服务没启动、token 不匹配，或者服务端返回了 4xx / 5xx。

### 6. 验证 Claude Code 实际 hook

在 Claude Code 里触发一个需要你注意的操作，例如让它执行一个需要确认的命令。你应该收到权限通知。

如果想验证长任务完成通知，可以临时把服务端阈值调低：

```bash
AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS=5
```

重启 AgentNotify 服务后，让 Claude Code 跑一个超过 5 秒的任务。任务结束时应该收到完成通知。验证完再把阈值改回你日常想要的值，例如 `120`。

Claude Code adapter 本身不保存状态。服务端收到 `UserPromptSubmit` 后在内存中记录本轮开始时间；
收到 `Stop` 后判断是否达到 `AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS`，然后删除该状态；
收到 `StopFailure` 后也会删除状态并发送失败通知。Claude Code 每轮结束后可能触发的 `Notification` / `idle_prompt` 会被 adapter 和服务端默认忽略，避免和长任务完成通知重复。异常残留由 24 小时 TTL 和 1000 条上限清理。

## Codex 接入

Codex 使用 command hooks 调用本地 adapter。AgentNotify 第一版只处理两类手机通知：

- `PermissionRequest`：Codex 需要用户批准权限时立即推送；`permission_mode` 为 `bypassPermissions` 时不推送。
- `Stop`：一轮任务结束后，只有达到服务端阈值才推送完成通知。

`UserPromptSubmit` 只用于服务端记录本轮开始时间，不会推送手机通知。

### 1. 确认服务端配置

`.env` 至少需要：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
BARK_ENDPOINT=https://api.day.app/你的设备Key
AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=120
```

如果 `AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS` 设为 `0` 或不配置，需要用户批准的 Codex 权限通知仍然会发送，但不会发送完成通知。

### 2. 创建 Codex adapter 配置

创建配置目录：

```bash
mkdir -p ~/.config/agent-notify
```

创建 `~/.config/agent-notify/codex.json`：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token",
  "timeoutMs": 2000,
  "debugLogPath": "/ABS/PATH/.config/agent-notify/codex-debug.jsonl"
}
```

`token` 只填 `.env` 里 `AGENT_NOTIFY_TOKENS` 冒号后面的部分。

### 3. 安装 Codex adapter 文件

在 AgentNotify 项目目录里执行：

```bash
mkdir -p ~/.config/agent-notify
cp examples/codex/agent-notify.mjs ~/.config/agent-notify/codex-agent-notify.mjs
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

OpenCode 侧仍然使用同一个插件配置文件：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "my-long-random-token",
  "timeoutMs": 2000
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
4. Claude Code hooks 里的 command 是否是 `node /绝对路径/.config/agent-notify/agent-notify.mjs`。
5. command 里的路径是否真实存在，可以用 `ls /绝对路径/.config/agent-notify/agent-notify.mjs` 检查。
6. Claude Code 是否已经重启并重新读取 settings。

先用手动 payload 测试 adapter：

```bash
printf '{"hook_event_name":"Notification","notification_type":"permission_prompt","session_id":"manual_debug","message":"AgentNotify debug"}' | node /ABS/PATH/.config/agent-notify/agent-notify.mjs
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
  "token": "my-long-random-token",
  "timeoutMs": 2000
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
