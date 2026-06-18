<div align="center">

## AgentNotify：AI 编程代理的个人通知中枢

[English](README.md) / 中文

[人类安装手册](docs/human-manual-cn.md)

[![](https://img.shields.io/github/stars/LetTTGACO/agent-notify?labelColor\&style=flat-square\&color=ffcb47)](https://github.com/LetTTGACO/agent-notify)
[![](https://img.shields.io/github/issues/LetTTGACO/agent-notify?labelColor=black\&style=flat-square\&color=ff80eb)](https://github.com/LetTTGACO/agent-notify/issues)
[![](https://img.shields.io/github/contributors/LetTTGACO/agent-notify?color=c4f042\&labelColor=black\&style=flat-square)](https://github.com/LetTTGACO/agent-notify/graphs/contributors)
[![](https://img.shields.io/github/last-commit/LetTTGACO/agent-notify?color=c4f042\&labelColor=black\&style=flat-square)](https://github.com/LetTTGACO/agent-notify/commits/main)

</div>


AgentNotify 接收 OpenCode、Claude Code 和 Codex 的 hook 事件，在服务端格式化成简短、行动导向的通知，记录安全的事件摘要，并通过 Bark 或 ntfy 推送到你的手机或桌面。

## 它能做什么

- 接收 OpenCode、Claude Code 和 Codex 的原始 hook 事件。
- 在服务端格式化简短、行动导向的通知（权限请求、提问、错误、长任务完成）。
- 让短任务保持安静，只在会话运行时间足够长时提醒你。
- 用会话级冷却压住高频「通知-处理-继续」循环，减少权限/问题提醒刷屏。
- 通过 Bark（iPhone / Apple Watch）或 ntfy（跨平台）推送。

## 支持的 agent

| Agent | 接入方式 | 转发事件 |
| --- | --- | --- |
| OpenCode | plugin 示例 | permission / question / session-error / idle-completion 事件 |
| Claude Code | command hook + adapter | `UserPromptSubmit`、选定的 `Notification`、`Stop`、`StopFailure` |
| Codex | command hook + adapter | `UserPromptSubmit`、`PermissionRequest`、`Stop` |

Adapter 是 fail-safe 的：服务端错误不会阻塞 agent。长任务完成状态由 AgentNotify 服务端跟踪，因此 adapter 保持无状态。

## 通知方式

| 平台 / 设备 | Bark | ntfy |
| --- | --- | --- |
| iPhone / Apple Watch | ✅ 推荐 | ✅ |
| Android | ❌ | ✅ 推荐 |
| macOS 桌面 | ❌ | ✅ |
| Windows 桌面 | ❌ | ✅ |
| Linux 桌面 | ❌ | ✅ |
| Web 浏览器 | ❌ | ✅ |

## 文档

人类使用手册：

- [人类使用手册（中文）](docs/human-manual-cn.md)
- [Human Manual (English)](docs/human-manual-en.md)

给 AI 编程代理看的端到端部署手册。将下面文档链接发给你的 agent，它就可以按手册一步步安装：

- [AI 使用手册](docs/ai-operation-manual.md)

把这段发给你的 AI Agent 来配置 AgentNotify：

```
根据这份文档帮我配置AgentNotify:
https://raw.githubusercontent.com/LetTTGACO/agent-notify/refs/heads/main/docs/ai-operation-manual.md
```

## License

[MIT](LICENSE) © LetTTGACO
