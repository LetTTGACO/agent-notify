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
- `session.error`

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
BARK_ENDPOINT=https://api.day.app/example-device-key
AGENT_NOTIFY_LOG_PATH=./data/events.jsonl
AGENT_NOTIFY_LOG_RAW=false
```

你需要改的是：

- `AGENT_NOTIFY_TOKENS`：服务端允许哪些客户端发事件，格式是 `名称:token`。
- `BARK_ENDPOINT`：换成你的 Bark endpoint。

建议把 `dev-token-change-me` 改成只有你知道的字符串。例如：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

后面配置 OpenCode 插件时，`AGENT_NOTIFY_TOKEN` 必须填同一个 token，也就是这里冒号后面的部分。

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

## 第六步：让 OpenCode 知道 AgentNotify 的地址和 token

OpenCode 插件会读取这几个环境变量：

```bash
export AGENT_NOTIFY_SERVER_URL=http://127.0.0.1:8787
export AGENT_NOTIFY_TOKEN=my-long-random-token
export AGENT_NOTIFY_TIMEOUT_MS=2000
```

其中：

- `AGENT_NOTIFY_SERVER_URL`：AgentNotify 服务地址。
- `AGENT_NOTIFY_TOKEN`：必须等于 `.env` 里 `AGENT_NOTIFY_TOKENS` 的 token 部分。
- `AGENT_NOTIFY_TIMEOUT_MS`：插件请求超时时间，默认 2000 毫秒。

最容易踩坑的地方是：这些环境变量必须存在于启动 OpenCode 的那个 shell 里。

推荐流程：

```bash
export AGENT_NOTIFY_SERVER_URL=http://127.0.0.1:8787
export AGENT_NOTIFY_TOKEN=my-long-random-token
export AGENT_NOTIFY_TIMEOUT_MS=2000
opencode
```

如果你想长期使用，可以把这些 `export` 写进你的 shell 配置文件，例如 `~/.zshrc`，然后重新打开终端。

## 第七步：实际验证 OpenCode 通知

保持 AgentNotify 服务运行：

```bash
pnpm dev
```

然后从带有环境变量的终端启动 OpenCode：

```bash
opencode
```

在 OpenCode 里触发一次需要权限的操作。例如让它执行一个需要确认的 shell 命令。插件捕捉到 `permission.v2.asked` 或 `permission.asked` 后，会向 AgentNotify 发送事件，AgentNotify 再发 Bark 通知。

收到通知时，大致会是：

```text
Approve bash
pnpm test
```

如果 OpenCode 会话报错，你会收到标题为 `Failed` 的通知。

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

OpenCode 侧仍然使用：

```bash
export AGENT_NOTIFY_SERVER_URL=http://127.0.0.1:8787
export AGENT_NOTIFY_TOKEN=my-long-random-token
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

1. 你是否从带有 `AGENT_NOTIFY_TOKEN` 的终端启动了 OpenCode。
2. `AGENT_NOTIFY_TOKEN` 是否等于服务端 `.env` 里 token 的冒号后半段。
3. 插件文件是否复制到了正确目录。
4. AgentNotify 服务是否正在运行。
5. 你触发的是否是当前支持的事件：权限请求或会话错误。

### token 配了还是 401

服务端配置是：

```bash
AGENT_NOTIFY_TOKENS=macbook:my-long-random-token
```

OpenCode 侧应该是：

```bash
export AGENT_NOTIFY_TOKEN=my-long-random-token
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

另一个终端进入你真正工作的代码项目，导出环境变量并启动 OpenCode：

```bash
export AGENT_NOTIFY_SERVER_URL=http://127.0.0.1:8787
export AGENT_NOTIFY_TOKEN=my-long-random-token
opencode
```

这样 OpenCode 遇到权限请求或会话错误时，你就会在手机和手表上收到提醒。
