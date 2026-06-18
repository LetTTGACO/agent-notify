import { describe, expect, it } from "vitest";
import { formatIncomingEvent } from "../../src/formatters/index.js";
import { formatClaudeCodeEvent } from "../../src/formatters/claude-code.js";

describe("Claude Code formatter", () => {
  it("formats permission Notification as a short approval notification", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_session_1",
        message: "Claude needs permission to use Bash",
      },
    });

    expect(formatted).toMatchObject({
      agent: "claude-code",
      kind: "permission_required",
      sourceEvent: "Notification",
      sessionId: "claude_session_1",
      notification: {
        title: "Approve permission",
        body: "Claude needs permission to use Bash",
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: "https://cdn.jsdelivr.net/gh/LetTTGACO/agent-notify@main/assets/claude-code.png",
      },
    });
  });

  it("formats idle Notification as an answer-required notification", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
        session_id: "claude_session_2",
        message: "Claude is waiting for your input",
      },
    });

    expect(formatted).toMatchObject({
      kind: "question_required",
      sourceEvent: "Notification",
      sessionId: "claude_session_2",
      notification: {
        title: "Question",
        body: "Claude is waiting for your input",
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: "https://cdn.jsdelivr.net/gh/LetTTGACO/agent-notify@main/assets/claude-code.png",
      },
    });
  });

  it("formats Stop as a completion notification", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Stop",
        session_id: "claude_session_3",
      },
    });

    expect(formatted).toMatchObject({
      kind: "completed",
      sourceEvent: "Stop",
      sessionId: "claude_session_3",
      notification: {
        urgency: "time_sensitive",
        group: "Claude Code",
      },
    });
  });

  it("formats StopFailure as a failed notification with error details", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "StopFailure",
        session_id: "claude_session_4",
        error: "rate_limit",
        error_details: "You've hit your session limit; resets 1:10am (Asia/Shanghai)",
      },
    });

    expect(formatted).toMatchObject({
      kind: "failed",
      sourceEvent: "StopFailure",
      sessionId: "claude_session_4",
      notification: {
        title: "Failed",
        body: "You've hit your session limit; resets 1:10am (Asia/Shanghai)",
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: "https://cdn.jsdelivr.net/gh/LetTTGACO/agent-notify@main/assets/claude-code.png",
      },
    });
  });

  it("formats Claude Code notifications in Chinese", () => {
    const formatted = formatClaudeCodeEvent(
      {
        agent: "claude-code",
        raw: {
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          session_id: "claude_session_zh",
          message: "需要批准 Bash",
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("需要批准");
    expect(formatted.notification.body).toBe("需要批准 Bash");
  });

  it("truncates long message bodies to one line", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "idle_prompt",
        session_id: "claude_session_5",
        message:
          "This is a very long Claude Code notification message\nthat should be shortened before it reaches a watch notification display because the screen is tiny",
      },
    });

    expect(formatted.notification.body).not.toContain("\n");
    expect(formatted.notification.body.length).toBeLessThanOrEqual(80);
    expect(formatted.notification.body.endsWith("...")).toBe(true);
  });

  it("throws a format error for unsupported Claude Code hook events", () => {
    expect(() =>
      formatClaudeCodeEvent({
        agent: "claude-code",
        raw: {
          hook_event_name: "PreToolUse",
          session_id: "claude_session_6",
        },
      }),
    ).toThrow("Unsupported Claude Code hook event: PreToolUse");
  });

  it("dispatches incoming events to the Claude Code formatter", () => {
    const formatted = formatIncomingEvent(
      {
        agent: "claude-code",
        raw: {
          hook_event_name: "Stop",
          session_id: "claude_session_7",
        },
      },
      { language: "zh" },
    );

    expect(formatted.kind).toBe("completed");
    expect(formatted.notification.group).toBe("Claude Code");
  });

  it("prefixes Claude Code notification titles with the project name from cwd", () => {
    const formatted = formatClaudeCodeEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_project_1",
        cwd: "/Users/1874w/@1874/agent-notify",
        message: "Claude needs permission to use Bash",
      },
    });

    expect(formatted.notification.title).toBe("[agent-notify] Approve permission");
  });

  it("prefixes Claude Code Chinese titles with the project name from cwd", () => {
    const formatted = formatClaudeCodeEvent(
      {
        agent: "claude-code",
        raw: {
          hook_event_name: "Stop",
          session_id: "claude_project_zh",
          cwd: "/Users/1874w/@1874/agent-notify",
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("[agent-notify] 待审阅");
  });
});
