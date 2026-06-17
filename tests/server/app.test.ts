import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { createApp } from "../../src/server/app.js";
import { ClaudeCodeSessionPolicy } from "../../src/server/claude-code-session-policy.js";
import { CodexSessionPolicy } from "../../src/server/codex-session-policy.js";
import { CooldownPolicy } from "../../src/server/cooldown-policy.js";
import type { NotificationProvider } from "../../src/providers/types.js";

function provider(): NotificationProvider {
  return {
    name: "mock",
    send: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
  };
}

function appOptions(mockProvider = provider()) {
  return {
    tokens: [{ name: "macbook", value: "secret" }],
    provider: mockProvider,
    logPath: "./data/test.jsonl",
    logRaw: false,
    language: "en" as const,
    claudeCompletionMinSeconds: 0,
    codexCompletionMinSeconds: 0,
    cooldownSeconds: 0,
  };
}

const permissionEnvelope = {
  agent: "opencode",
  raw: {
    id: "evt_1",
    type: "permission.v2.asked",
    properties: {
      id: "perm_1",
      sessionID: "session_1",
      action: "bash",
      resources: ["pnpm test"],
    },
  },
};

describe("server app", () => {
  const trackedLogPaths: string[] = [];

  afterEach(async () => {
    while (trackedLogPaths.length > 0) {
      const path = trackedLogPaths.pop();
      if (!path) break;
      try {
        await rm(path, { force: true });
      } catch {
        // Ignore cleanup failures; the data/ directory is gitignored.
      }
    }
  });

  it("rejects missing auth", async () => {
    const app = createApp(appOptions());

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("accepts a raw OpenCode event and sends formatted provider notification", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Approve bash",
      body: "pnpm test",
      urgency: "time_sensitive",
      group: "OpenCode",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });
  });

  it("accepts a raw Claude Code event and sends formatted provider notification", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_server_1",
          message: "Claude needs permission to use Bash",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Approve permission",
      body: "Claude needs permission to use Bash",
      urgency: "time_sensitive",
      group: "Claude Code",
      icon: "https://claude.ai/favicon.ico",
    });
  });

  it("sends Chinese formatted notifications when configured", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      language: "zh",
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "批准运行命令",
      body: "pnpm test",
      urgency: "time_sensitive",
      group: "OpenCode",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });
  });

  it("rejects the old normalized payload", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "opencode",
        kind: "attention",
        title: "Hi",
        project: "agent-notify",
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(400);
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("rejects malformed OpenCode raw events", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "opencode",
        raw: {
          id: "evt_2",
          properties: {},
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(400);
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("reports health without secrets", async () => {
    const app = createApp(appOptions());

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      provider: "mock",
      logPath: "./data/test.jsonl",
    });
  });

  it("does not fail /events when logger cannot write", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      logPath: "/dev/null/should-not-exist/events.jsonl",
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledOnce();
  });

  it("records Claude Code UserPromptSubmit without sending a notification", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      claudeCodeSessionPolicy: new ClaudeCodeSessionPolicy({
        completionMinSeconds: 120,
        nowMs: () => 1_000,
      }),
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "claude_server_prompt",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("suppresses Claude Code idle Notification without sending a notification", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      claudeCodeSessionPolicy: new ClaudeCodeSessionPolicy({
        completionMinSeconds: 120,
        nowMs: () => 1_000,
      }),
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "Notification",
          notification_type: "idle_prompt",
          session_id: "claude_idle",
          message: "Claude is waiting for your input",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("suppresses Claude Code Stop before the completion threshold", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });
    const app = createApp({
      ...appOptions(mockProvider),
      claudeCodeSessionPolicy: policy,
    });

    await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "claude_short",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    nowMs += 10_000;

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "Stop",
          session_id: "claude_short",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("sends Claude Code Stop after the completion threshold", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });
    const app = createApp({
      ...appOptions(mockProvider),
      claudeCodeSessionPolicy: policy,
    });

    await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "claude_long",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    nowMs += 121_000;

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "Stop",
          session_id: "claude_long",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      urgency: "time_sensitive",
      group: "Claude Code",
      icon: "https://claude.ai/favicon.ico",
    }));
  });

  it("clears Claude Code completion state on StopFailure and sends failure notification", async () => {
    const mockProvider = provider();
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });
    const app = createApp({
      ...appOptions(mockProvider),
      claudeCodeSessionPolicy: policy,
    });

    await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "claude_failed",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "StopFailure",
          session_id: "claude_failed",
          error_details: "API Error: quota exceeded",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(policy.sessionCount()).toBe(0);
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Failed",
      body: "API Error: quota exceeded",
      urgency: "time_sensitive",
      group: "Claude Code",
      icon: "https://claude.ai/favicon.ico",
    });
  });

  it("records Codex UserPromptSubmit without sending a notification", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      codexCompletionMinSeconds: 120,
      codexSessionPolicy: new CodexSessionPolicy({
        completionMinSeconds: 120,
        nowMs: () => 1_000,
      }),
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "codex_server_prompt",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("sends Codex PermissionRequest immediately", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      codexCompletionMinSeconds: 120,
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "PermissionRequest",
          session_id: "codex_permission",
          tool_name: "Bash",
          tool_input: {
            description: "Codex wants to run pnpm test",
            command: "pnpm test",
          },
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Approve permission",
      body: "Codex wants to run pnpm test",
      urgency: "time_sensitive",
      group: "Codex",
      icon: "https://openai.com/favicon.ico",
    });
  });

  it("suppresses bypassed Codex PermissionRequest without sending a notification", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      codexCompletionMinSeconds: 120,
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "PermissionRequest",
          permission_mode: "bypassPermissions",
          session_id: "codex_permission",
          tool_name: "Bash",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("suppresses Codex Stop before the completion threshold", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });
    const app = createApp({
      ...appOptions(mockProvider),
      codexCompletionMinSeconds: 120,
      codexSessionPolicy: policy,
    });

    await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "codex_short",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    nowMs += 10_000;

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "Stop",
          session_id: "codex_short",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("sends Codex Stop after the completion threshold", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });
    const app = createApp({
      ...appOptions(mockProvider),
      codexCompletionMinSeconds: 120,
      codexSessionPolicy: policy,
    });

    await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: "codex_long",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    nowMs += 121_000;

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "Stop",
          session_id: "codex_long",
          last_assistant_message: "Codex finished the requested change.",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Ready to review",
      body: "Codex finished the requested change.",
      urgency: "time_sensitive",
      group: "Codex",
      icon: "https://openai.com/favicon.ico",
    });
  });

  it("logs a JSONL suppressed entry for Codex UserPromptSubmit", async () => {
    const logPath = `./data/test-codex-suppressed-${Date.now()}.jsonl`;
    trackedLogPaths.push(logPath);

    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      logPath,
      codexCompletionMinSeconds: 120,
      codexSessionPolicy: new CodexSessionPolicy({
        completionMinSeconds: 120,
        nowMs: () => 1_000,
      }),
    });

    const sessionId = `codex_prompt_${Date.now()}`;
    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "codex",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();

    const contents = await readFile(logPath, "utf8");
    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const suppressedLine = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find(
        (entry) =>
          entry.status === "suppressed" &&
          entry.kind === "state" &&
          entry.agent === "codex" &&
          entry.sourceEvent === "UserPromptSubmit",
      );

    expect(suppressedLine).toMatchObject({
      status: "suppressed",
      kind: "state",
      agent: "codex",
      sourceEvent: "UserPromptSubmit",
      sessionId,
      reason: "state_recorded",
    });
  });

  it("logs a JSONL suppressed entry for Claude Code UserPromptSubmit", async () => {
    const logPath = `./data/test-suppressed-${Date.now()}.jsonl`;
    trackedLogPaths.push(logPath);

    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      logPath,
      claudeCodeSessionPolicy: new ClaudeCodeSessionPolicy({
        completionMinSeconds: 120,
        nowMs: () => 1_000,
      }),
    });

    const sessionId = `claude_prompt_${Date.now()}`;
    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "claude-code",
        raw: {
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).not.toHaveBeenCalled();

    const contents = await readFile(logPath, "utf8");
    const lines = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const suppressedLine = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find(
        (entry) =>
          entry.status === "suppressed" &&
          entry.kind === "state" &&
          entry.sourceEvent === "UserPromptSubmit",
      );

    expect(suppressedLine).toMatchObject({
      status: "suppressed",
      kind: "state",
      agent: "claude-code",
      sourceEvent: "UserPromptSubmit",
      sessionId,
      reason: "state_recorded",
    });
  });

  it("suppresses a second consecutive permission within the cooldown window", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      cooldownSeconds: 10,
      cooldownPolicy: new CooldownPolicy({
        cooldownSeconds: 10,
        nowMs: () => nowMs,
      }),
    });

    const body = JSON.stringify({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_perm",
        message: "Claude needs permission",
      },
    });
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer secret",
    };

    const first = await app.request("/events", { method: "POST", body, headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledOnce();

    nowMs += 3_000;

    const second = await app.request("/events", { method: "POST", body, headers });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, notified: false });
    expect(mockProvider.send).toHaveBeenCalledOnce();
  });

  it("sends both permissions when cooldown is disabled", async () => {
    let nowMs = 1_000;
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      cooldownSeconds: 0,
      cooldownPolicy: new CooldownPolicy({
        cooldownSeconds: 0,
        nowMs: () => nowMs,
      }),
    });

    const body = JSON.stringify({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_perm2",
        message: "Claude needs permission",
      },
    });
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer secret",
    };

    await app.request("/events", { method: "POST", body, headers });
    nowMs += 3_000;
    await app.request("/events", { method: "POST", body, headers });

    expect(mockProvider.send).toHaveBeenCalledTimes(2);
  });
});
