# AgentNotify 人类使用手册

这份手册写给“想在 OpenCode 里收到手机通知”的人。你不需要先读源码；照着走一遍，就能把 OpenCode 的关键事件转发到 AgentNotify，再由 Bark 推送到 iPhone 或 Apple Watch。

## 这个项目是做什么的

AgentNotify 是一个本地通知中转站：

1. OpenCode 运行到需要你处理的事件，例如请求命令权限或会话报错。
2. OpenCode 插件把事件发到本机的 AgentNotify 服务。
3. AgentNotify 把事件格式化成简短通知。
4. AgentNotify 调用 Bark，把通知推到你的 iPhone / Apple Watch。

当前版本主要支持这些 OpenCode 事件：

- `permission.v2.asked`
- `permission.asked`
- `question.asked`
- `session.error`
- `session.idle`：仅在插件配置了 `completionMinSeconds` 且本轮耗时达到阈值时转发

也就是说，它不会把 OpenCode 的每一步都推给你，只会推需要你注意的事件。

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
BARK_ENDPOINT=https://api.day.app/example-device-key
AGENT_NOTIFY_LOG_PATH=./data/events.jsonl
AGENT_NOTIFY_LOG_RAW=false
```

你需要改的是：

- `AGENT_NOTIFY_TOKENS`：服务端允许哪些客户端发事件，格式是 `名称:token`。
- `BARK_ENDPOINT`：换成你的 Bark endpoint。
- `AGENT_NOTIFY_LANGUAGE`：通知文案语言，支持 `en` 和 `zh`，默认 `en`。

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
cp /Users/1874w/@1874/agent-notify/examples/opencode/agent-notify.ts .opencode/plugins/agent-notify.ts
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
  "debugLogPath": "/Users/1874w/.config/opencode/agent-notify-debug.jsonl"
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

Claude Code 使用 command hooks 调用示例 adapter。这个 adapter 不进入正式 CLI；它只负责读取 Claude Code hook stdin、处理长任务阈值，然后把事件包装成现有 `/events` 请求。

配置文件：

```json
{
  "serverUrl": "http://127.0.0.1:8787",
  "token": "dev-token-change-me",
  "timeoutMs": 2000,
  "completionMinSeconds": 120,
  "debugLogPath": "/Users/1874w/.config/claude-code/agent-notify-debug.jsonl"
}
```

需要配置的 Claude Code hooks：

- `UserPromptSubmit`：记录本轮开始时间，不发通知
- `Notification`：需要用户注意时通知
- `Stop`：达到 `completionMinSeconds` 后通知任务完成
- `StopFailure`：任务失败或限额错误时通知

adapter 默认使用 `~/.config/claude-code/agent-notify-state.json` 保存小型状态表。它不是日志文件；每次写入会清理过期 session，并在 `Stop` / `StopFailure` 后删除对应 session。

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
tail -f /Users/1874w/.config/opencode/agent-notify-debug.jsonl
```

每行里的 `forwarded` 表示该事件是否被转发给 AgentNotify。比如 `message.updated` 这类事件可能会出现在插件端日志里，但当前不会触发手机通知。这个文件是本地排障数据，可能包含原始会话信息，不要直接分享；排查完可以手动清理。

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
cd /Users/1874w/@1874/agent-notify
pnpm dev
```

另一个终端进入你真正工作的代码项目，直接启动 OpenCode：

```bash
opencode
```

这样 OpenCode 遇到权限请求、问题选择或会话错误时，你就会在手机和手表上收到提醒。
