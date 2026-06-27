import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("parses AgentNotify commands for Codex", () => {
    const now = new Date("2026-06-28T08:00:00.000Z");

    expect(adapter.parseAgentNotifyCommand("/agent-notify on", now)).toEqual({
      type: "on",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify status", now)).toEqual(
      {
        type: "status",
      },
    );
    expect(adapter.parseAgentNotifyCommand("/agent-notify off", now)).toEqual({
      type: "off-session",
    });
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify off persist", now),
    ).toEqual({
      type: "off-persist",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify off 30m", now)).toEqual(
      {
        type: "off-until",
        until: "2026-06-28T08:30:00.000Z",
      },
    );
    expect(adapter.parseAgentNotifyCommand("/agent-notify nope", now).type).toBe(
      "invalid",
    );
    expect(adapter.parseAgentNotifyCommand("normal prompt", now)).toEqual({
      type: "none",
    });
  });

  it("evaluates Codex switch state by precedence", () => {
    const now = new Date("2026-06-28T08:00:00.000Z");

    expect(
      adapter.getCodexMuteReason(
        { persistentDisabled: true, disabledSessions: {} },
        "codex_session_1",
        now,
      ),
    ).toBe("persistent");

    expect(
      adapter.getCodexMuteReason(
        {
          persistentDisabled: false,
          temporaryDisabledUntil: "2026-06-28T08:05:00.000Z",
          disabledSessions: {},
        },
        "codex_session_1",
        now,
      ),
    ).toBe("timed");

    expect(
      adapter.getCodexMuteReason(
        {
          persistentDisabled: false,
          temporaryDisabledUntil: "2026-06-28T07:59:00.000Z",
          disabledSessions: {
            codex_session_1: { disabledAt: "2026-06-28T07:55:00.000Z" },
          },
        },
        "codex_session_1",
        now,
      ),
    ).toBe("session");

    expect(
      adapter.getCodexMuteReason(
        {
          persistentDisabled: false,
          temporaryDisabledUntil: "2026-06-28T07:59:00.000Z",
          disabledSessions: {},
        },
        "codex_session_1",
        now,
      ),
    ).toBeUndefined();
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

  it("does not send Codex events while the current session is muted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const statePath = "/tmp/agent-notify-codex-muted.json";
    const readState = vi.fn().mockReturnValue({
      persistentDisabled: false,
      disabledSessions: {
        codex_session_5: { disabledAt: "2026-06-28T08:00:00.000Z" },
      },
    });
    const writeState = vi.fn();

    await expect(
      adapter.handleCodexEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_5",
          tool_name: "Bash",
        },
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath,
          readState,
          writeState,
        },
      ),
    ).resolves.toEqual({ forwarded: true, sent: false, muted: "session" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readState).toHaveBeenCalledWith(statePath);
    expect(writeState).not.toHaveBeenCalled();
  });

  it("executes /agent-notify status through handleCodexEvent", async () => {
    const statePath = "/tmp/agent-notify-codex-status.json";
    const readState = vi.fn().mockReturnValue({
      persistentDisabled: true,
      disabledSessions: {},
    });
    const writeState = vi.fn();
    const fetchMock = vi.fn();

    await expect(
      adapter.handleCodexEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "UserPromptSubmit",
          session_id: "codex_session_9",
          prompt: "/agent-notify status",
        },
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath,
          readState,
          writeState,
        },
      ),
    ).resolves.toEqual({
      forwarded: false,
      sent: false,
      command: "status",
      message: "AgentNotify is persistently muted for Codex.",
    });

    expect(readState).toHaveBeenCalledWith(statePath);
    expect(writeState).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Codex events when the switch state file is malformed and surfaces debug info", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-codex-"));
    const statePath = join(tempDir, "codex.json");
    writeFileSync(statePath, "{not-json", "utf8");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.handleCodexEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_11",
          tool_name: "Bash",
        },
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath,
        },
      ),
    ).resolves.toEqual({
      forwarded: true,
      sent: true,
      debug: expect.objectContaining({
        switchStateReadError: expect.stringContaining("state-read"),
      }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats parseable malformed Codex disabledSessions as enabled and surfaces debug info", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-codex-"));
    const statePath = join(tempDir, "codex.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        persistentDisabled: false,
        disabledSessions: {
          codex_session_13: true,
        },
      }),
      "utf8",
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.handleCodexEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_13",
          tool_name: "Bash",
        },
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath,
        },
      ),
    ).resolves.toEqual({
      forwarded: true,
      sent: true,
      debug: expect.objectContaining({
        switchStateReadError: "state-read: invalid disabledSessions.codex_session_13",
      }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats parseable malformed Codex state roots as enabled with a read error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-codex-"));
    const statePath = join(tempDir, "codex.json");
    writeFileSync(statePath, JSON.stringify([]), "utf8");

    expect(adapter.readCodexSwitchState(statePath)).toEqual({
      persistentDisabled: false,
      disabledSessions: {},
      readError: "state-read: invalid state root",
    });
  });

  it("forwards Codex events when reading switch state throws and surfaces debug info", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const readState = vi.fn(() => {
      throw new Error("EACCES: permission denied");
    });

    await expect(
      adapter.handleCodexEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_12",
          tool_name: "Bash",
        },
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath: "/tmp/agent-notify-codex-unreadable.json",
          readState,
        },
      ),
    ).resolves.toEqual({
      forwarded: true,
      sent: true,
      debug: expect.objectContaining({
        switchStateReadError: "state-read: EACCES: permission denied",
      }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
