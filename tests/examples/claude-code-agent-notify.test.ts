import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("parses AgentNotify commands for Claude Code", () => {
    const now = new Date("2026-06-28T08:00:00.000Z");

    expect(adapter.parseAgentNotifyCommand("/agent-notify on", now)).toEqual({
      type: "on",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify", now)).toEqual({
      type: "status",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify status", now)).toEqual({
      type: "status",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify clear", now)).toEqual({
      type: "clear-sessions",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify off", now)).toEqual({
      type: "off-session",
    });
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify off persist", now),
    ).toEqual({
      type: "off-persist",
    });
    expect(adapter.parseAgentNotifyCommand("/agent-notify off 2h", now)).toEqual({
      type: "off-until",
      until: "2026-06-28T10:00:00.000Z",
    });
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify on please", now).type,
    ).toBe("invalid");
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify status please", now).type,
    ).toBe("invalid");
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify off 1h please", now).type,
    ).toBe("invalid");
    expect(
      adapter.parseAgentNotifyCommand("/agent-notify off forever", now).type,
    ).toBe("invalid");
    expect(adapter.parseAgentNotifyCommand("normal prompt", now)).toEqual({
      type: "none",
    });
  });

  it("evaluates Claude Code switch state by precedence", () => {
    const now = new Date("2026-06-28T08:00:00.000Z");

    expect(
      adapter.getClaudeCodeMuteReason(
        { persistentDisabled: true, disabledSessions: {} },
        "claude_session_1",
        now,
      ),
    ).toBe("persistent");

    expect(
      adapter.getClaudeCodeMuteReason(
        {
          persistentDisabled: false,
          temporaryDisabledUntil: "2026-06-28T08:05:00.000Z",
          disabledSessions: {},
        },
        "claude_session_1",
        now,
      ),
    ).toBe("timed");

    expect(
      adapter.getClaudeCodeMuteReason(
        {
          persistentDisabled: false,
          disabledSessions: {
            claude_session_1: { disabledAt: "2026-06-28T07:55:00.000Z" },
          },
        },
        "claude_session_1",
        now,
      ),
    ).toBe("session");
  });

  it("keeps only the latest five muted Claude Code sessions", () => {
    const result = adapter.applyClaudeCodeSwitchCommand(
      {
        persistentDisabled: false,
        disabledSessions: {
          claude_session_1: { disabledAt: "2026-06-28T08:00:01.000Z" },
          claude_session_2: { disabledAt: "2026-06-28T08:00:02.000Z" },
          claude_session_3: { disabledAt: "2026-06-28T08:00:03.000Z" },
          claude_session_4: { disabledAt: "2026-06-28T08:00:04.000Z" },
          claude_session_5: { disabledAt: "2026-06-28T08:00:05.000Z" },
        },
      },
      { type: "off-session" },
      "claude_session_6",
      new Date("2026-06-28T08:00:06.000Z"),
    );

    expect(result.state.disabledSessions).toEqual({
      claude_session_2: { disabledAt: "2026-06-28T08:00:02.000Z" },
      claude_session_3: { disabledAt: "2026-06-28T08:00:03.000Z" },
      claude_session_4: { disabledAt: "2026-06-28T08:00:04.000Z" },
      claude_session_5: { disabledAt: "2026-06-28T08:00:05.000Z" },
      claude_session_6: { disabledAt: "2026-06-28T08:00:06.000Z" },
    });
  });

  it("clears only Claude Code session mute records", () => {
    const result = adapter.applyClaudeCodeSwitchCommand(
      {
        persistentDisabled: false,
        temporaryDisabledUntil: "2026-06-28T09:00:00.000Z",
        currentSessionId: "claude_session_1",
        disabledSessions: {
          claude_session_1: { disabledAt: "2026-06-28T08:00:01.000Z" },
          claude_session_2: { disabledAt: "2026-06-28T08:00:02.000Z" },
        },
      },
      { type: "clear-sessions" },
      "claude_session_2",
      new Date("2026-06-28T08:00:06.000Z"),
    );

    expect(result).toEqual({
      state: {
        persistentDisabled: false,
        temporaryDisabledUntil: "2026-06-28T09:00:00.000Z",
        currentSessionId: "claude_session_1",
        disabledSessions: {},
      },
      message: "AgentNotify session mutes are cleared for Claude Code.",
    });
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

  it("does not send Claude Code events while the current session is muted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const statePath = "/tmp/agent-notify-claude-muted.json";
    const readState = vi.fn().mockReturnValue({
      persistentDisabled: false,
      disabledSessions: {
        claude_session_5: { disabledAt: "2026-06-28T08:00:00.000Z" },
      },
    });
    const writeState = vi.fn();

    await expect(
      adapter.handleClaudeCodeEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_session_5",
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
  });

  it("executes /agent-notify status through handleClaudeCodeEvent", async () => {
    const statePath = "/tmp/agent-notify-claude-status.json";
    const readState = vi.fn().mockReturnValue({
      persistentDisabled: true,
      disabledSessions: {},
    });
    const writeState = vi.fn();
    const fetchMock = vi.fn();

    await expect(
      adapter.handleClaudeCodeEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "UserPromptSubmit",
          session_id: "claude_session_9",
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
      message: "AgentNotify is persistently muted for Claude Code.",
    });

    expect(readState).toHaveBeenCalledWith(statePath);
    expect(writeState).toHaveBeenCalledWith(statePath, {
      persistentDisabled: true,
      currentSessionId: "claude_session_9",
      disabledSessions: {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Claude Code events when the switch state file is malformed and surfaces debug info", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-claude-"));
    const statePath = join(tempDir, "claude-code.json");
    writeFileSync(statePath, "{not-json", "utf8");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.handleClaudeCodeEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_session_11",
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

  it("treats parseable malformed Claude Code disabledSessions as enabled and surfaces debug info", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-claude-"));
    const statePath = join(tempDir, "claude-code.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        persistentDisabled: false,
        disabledSessions: {
          claude_session_13: true,
        },
      }),
      "utf8",
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      adapter.handleClaudeCodeEvent(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_session_13",
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
        switchStateReadError: "state-read: invalid disabledSessions.claude_session_13",
      }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats parseable malformed Claude Code state roots as enabled with a read error", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-claude-"));
    const statePath = join(tempDir, "claude-code.json");
    writeFileSync(statePath, JSON.stringify([]), "utf8");

    expect(adapter.readClaudeCodeSwitchState(statePath)).toEqual({
      persistentDisabled: false,
      disabledSessions: {},
      readError: "state-read: invalid state root",
    });
  });

  it("writes switch state read errors into the configured debug log during normal CLI execution", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-claude-cli-"));
    const homeDir = join(tempDir, "home");
    const configDir = join(homeDir, ".config", "agent-notify");
    const stateDir = join(homeDir, ".config", "agent-notify", "state");
    const debugLogPath = join(tempDir, "claude-debug.log");
    const statePath = join(stateDir, "claude-code.json");

    mkdirSync(configDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(configDir, "claude-code.json"),
      JSON.stringify({
        serverUrl: "http://127.0.0.1:1",
        token: "secret",
        timeoutMs: 25,
        debugLogPath,
      }),
      "utf8",
    );
    writeFileSync(statePath, "{not-json", "utf8");

    execFileSync(
      process.execPath,
      [join(process.cwd(), "examples/claude-code/claude-code-agent-notify.mjs")],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: homeDir,
        },
        input: JSON.stringify({
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_session_12",
        }),
      },
    );

    const debugLogEntry = JSON.parse(readFileSync(debugLogPath, "utf8").trim());
    expect(debugLogEntry).toMatchObject({
      forwarded: true,
      sent: false,
      hookEventName: "Notification",
      sessionId: "claude_session_12",
      switchStateReadError: expect.stringContaining("state-read"),
    });
  });
});
