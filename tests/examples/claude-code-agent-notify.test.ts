import { describe, expect, it, vi } from "vitest";

const adapter = await import("../../examples/claude-code/claude-code-agent-notify.mjs");

describe("Claude Code adapter example", () => {
  it("summarizes every event for adapter-side debug logs", () => {
    const raw = {
      hook_event_name: "Notification",
      notification_type: "idle_prompt",
      session_id: "session_debug_1",
      message: "Claude is waiting",
    };

    expect(adapter.summarizeClaudeCodeEventForDebug(raw)).toEqual({
      hookEventName: "Notification",
      sessionId: "session_debug_1",
      raw,
    });
  });

  it("forwards only supported Claude Code hook events", () => {
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "UserPromptSubmit",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
      }),
    ).toBe(false);
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "Stop",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "StopFailure",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardClaudeCodeEvent({
        hook_event_name: "PreToolUse",
      }),
    ).toBe(false);
  });

  it("defaults timeoutMs to 2000 when not configured", () => {
    const config = adapter.parseClaudeCodeConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
    });

    expect(config.timeoutMs).toBe(2_000);
  });

  it("uses the configured timeoutMs", () => {
    const config = adapter.parseClaudeCodeConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
      timeoutMs: 5_000,
    });

    expect(config.timeoutMs).toBe(5_000);
  });

  it("posts forwarded events to the existing /events endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.sendClaudeCodeEvent(
        "http://127.0.0.1:8787/",
        "secret",
        2_000,
        {
          hook_event_name: "Notification",
          session_id: "claude_session_5",
        },
        fetchMock,
      ),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/events",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
        },
        body: JSON.stringify({
          agent: "claude-code",
          raw: {
            hook_event_name: "Notification",
            session_id: "claude_session_5",
          },
        }),
      }),
    );
  });

  it("reports server rejection as an unsent event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(
      adapter.sendClaudeCodeEvent(
        "http://127.0.0.1:8787/",
        "secret",
        2_000,
        {
          hook_event_name: "Notification",
          session_id: "claude_session_5",
        },
        fetchMock,
      ),
    ).resolves.toBe(false);
  });
});
