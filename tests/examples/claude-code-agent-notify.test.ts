import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClaudeCodeNotificationFilter,
  loadState,
  saveState,
  summarizeClaudeCodeEventForDebug,
} from "../../examples/claude-code/agent-notify.js";

const tempDirs: string[] = [];

function tempStatePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-notify-claude-"));
  tempDirs.push(dir);
  return join(dir, "state.json");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Claude Code adapter example", () => {
  it("summarizes every event for adapter-side debug logs", () => {
    const raw = {
      hook_event_name: "Notification",
      notification_type: "idle_prompt",
      session_id: "session_debug_1",
      message: "Claude is waiting",
    };

    expect(summarizeClaudeCodeEventForDebug(raw)).toEqual({
      hookEventName: "Notification",
      sessionId: "session_debug_1",
      raw,
    });
  });

  it("records UserPromptSubmit without forwarding", () => {
    let nowMs = 1_000;
    const statePath = tempStatePath();
    const filter = createClaudeCodeNotificationFilter({
      completionMinSeconds: 120,
      statePath,
      nowMs: () => nowMs,
    });

    expect(
      filter.shouldNotify({
        hook_event_name: "UserPromptSubmit",
        session_id: "claude_session_1",
      }),
    ).toBe(false);

    expect(loadState(statePath)).toEqual({
      sessions: {
        claude_session_1: {
          startedAtMs: 1_000,
        },
      },
    });
  });

  it("does not forward Stop before the completion threshold", () => {
    let nowMs = 1_000;
    const statePath = tempStatePath();
    const filter = createClaudeCodeNotificationFilter({
      completionMinSeconds: 120,
      statePath,
      nowMs: () => nowMs,
    });

    filter.shouldNotify({
      hook_event_name: "UserPromptSubmit",
      session_id: "claude_session_2",
    });

    nowMs += 10_000;

    expect(
      filter.shouldNotify({
        hook_event_name: "Stop",
        session_id: "claude_session_2",
      }),
    ).toBe(false);
    expect(loadState(statePath)).toEqual({ sessions: {} });
  });

  it("forwards Stop after the completion threshold", () => {
    let nowMs = 1_000;
    const statePath = tempStatePath();
    const filter = createClaudeCodeNotificationFilter({
      completionMinSeconds: 120,
      statePath,
      nowMs: () => nowMs,
    });

    filter.shouldNotify({
      hook_event_name: "UserPromptSubmit",
      session_id: "claude_session_3",
    });

    nowMs += 121_000;

    expect(
      filter.shouldNotify({
        hook_event_name: "Stop",
        session_id: "claude_session_3",
      }),
    ).toBe(true);
    expect(loadState(statePath)).toEqual({ sessions: {} });
  });

  it("forwards Notification and StopFailure immediately", () => {
    const statePath = tempStatePath();
    const filter = createClaudeCodeNotificationFilter({
      completionMinSeconds: 120,
      statePath,
      nowMs: () => 1_000,
    });

    expect(
      filter.shouldNotify({
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_session_4",
      }),
    ).toBe(true);

    expect(
      filter.shouldNotify({
        hook_event_name: "StopFailure",
        session_id: "claude_session_4",
      }),
    ).toBe(true);
  });

  it("cleans expired sessions when recording a new prompt", () => {
    const statePath = tempStatePath();
    saveState(statePath, {
      sessions: {
        old_session: { startedAtMs: 1_000 },
      },
    });

    const filter = createClaudeCodeNotificationFilter({
      completionMinSeconds: 120,
      statePath,
      stateTtlMs: 24 * 60 * 60 * 1000,
      nowMs: () => 1_000 + 25 * 60 * 60 * 1000,
    });

    filter.shouldNotify({
      hook_event_name: "UserPromptSubmit",
      session_id: "new_session",
    });

    expect(loadState(statePath)).toEqual({
      sessions: {
        new_session: {
          startedAtMs: 1_000 + 25 * 60 * 60 * 1000,
        },
      },
    });
  });

  it("posts forwarded events to the existing /events endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const { sendClaudeCodeEvent } = await import(
      "../../examples/claude-code/agent-notify.js"
    );

    await sendClaudeCodeEvent(
      "http://127.0.0.1:8787/",
      "secret",
      2_000,
      {
        hook_event_name: "Notification",
        session_id: "claude_session_5",
      },
      fetchMock,
    );

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
});
