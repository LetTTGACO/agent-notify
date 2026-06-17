import { describe, expect, it, vi } from "vitest";

const adapter = await import("../../examples/codex/codex-agent-notify.mjs");

describe("Codex adapter example", () => {
  it("summarizes every event for adapter-side debug logs", () => {
    const raw = {
      hook_event_name: "PermissionRequest",
      session_id: "session_debug_1",
      tool_name: "Bash",
      tool_input: {
        command: "pnpm test",
        description: "Run tests",
      },
    };

    expect(adapter.summarizeCodexEventForDebug(raw)).toEqual({
      hookEventName: "PermissionRequest",
      sessionId: "session_debug_1",
      toolName: "Bash",
      raw,
    });
  });

  it("forwards only supported Codex hook events", () => {
    expect(
      adapter.shouldForwardCodexEvent({
        hook_event_name: "UserPromptSubmit",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardCodexEvent({
        hook_event_name: "PermissionRequest",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardCodexEvent({
        hook_event_name: "PermissionRequest",
        permission_mode: "bypassPermissions",
      }),
    ).toBe(false);
    expect(
      adapter.shouldForwardCodexEvent({
        hook_event_name: "Stop",
      }),
    ).toBe(true);
    expect(
      adapter.shouldForwardCodexEvent({
        hook_event_name: "PostToolUse",
      }),
    ).toBe(false);
    expect(adapter.shouldForwardCodexEvent({})).toBe(false);
  });

  it("defaults timeoutMs to 2000 when not configured", () => {
    const config = adapter.parseCodexConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
    });

    expect(config.timeoutMs).toBe(2_000);
  });

  it("uses the configured timeoutMs", () => {
    const config = adapter.parseCodexConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
      timeoutMs: 5_000,
    });

    expect(config.timeoutMs).toBe(5_000);
  });

  it("posts forwarded events to the existing /events endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.sendCodexEvent(
        "http://127.0.0.1:8787/",
        "secret",
        2_000,
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_5",
          tool_name: "Bash",
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
          agent: "codex",
          raw: {
            hook_event_name: "PermissionRequest",
            session_id: "codex_session_5",
            tool_name: "Bash",
          },
        }),
      }),
    );
  });

  it("reports server rejection as an unsent event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(
      adapter.sendCodexEvent(
        "http://127.0.0.1:8787/",
        "secret",
        2_000,
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_5",
        },
        fetchMock,
      ),
    ).resolves.toBe(false);
  });
});
