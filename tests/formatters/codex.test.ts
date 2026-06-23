import { describe, expect, it } from "vitest";
import { formatIncomingEvent } from "../../src/formatters/index.js";
import { formatCodexEvent } from "../../src/formatters/codex.js";

describe("Codex formatter", () => {
  it("formats PermissionRequest using tool_input.description", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_session_1",
        tool_name: "Bash",
        tool_input: {
          command: "pnpm test",
          description: "Codex wants to run the test suite",
        },
      },
    });

    expect(formatted).toMatchObject({
      agent: "codex",
      kind: "permission_required",
      sourceEvent: "PermissionRequest",
      sessionId: "codex_session_1",
      notification: {
        title: "Approve permission",
        body: "Codex wants to run the test suite",
        urgency: "time_sensitive",
        group: "Codex",
      },
    });
  });

  it("formats PermissionRequest using tool_input.command fallback", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_session_2",
        tool_name: "Bash",
        tool_input: {
          command: "pnpm build",
        },
      },
    });

    expect(formatted.notification.body).toBe("pnpm build");
  });

  it("formats PermissionRequest using tool_name fallback", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_session_3",
        tool_name: "apply_patch",
        tool_input: {},
      },
    });

    expect(formatted.notification.body).toBe("apply_patch");
  });

  it("formats PermissionRequest with Chinese title and fallback body", () => {
    const formatted = formatCodexEvent(
      {
        agent: "codex",
        raw: {
          hook_event_name: "PermissionRequest",
          session_id: "codex_session_zh",
          tool_input: {},
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("需要批准");
    expect(formatted.notification.body).toBe("请回到 Codex 查看");
  });

  it("formats Stop using last_assistant_message", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "Stop",
        session_id: "codex_session_4",
        last_assistant_message: "Implemented the Codex adapter and tests.",
      },
    });

    expect(formatted).toMatchObject({
      agent: "codex",
      kind: "completed",
      sourceEvent: "Stop",
      sessionId: "codex_session_4",
      notification: {
        title: "Ready to review",
        body: "Implemented the Codex adapter and tests.",
        urgency: "time_sensitive",
        group: "Codex",
      },
    });
  });

  it("formats Stop with completion fallback body", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "Stop",
        session_id: "codex_session_5",
      },
    });

    expect(formatted.notification.body).toBe("Review results or next steps");
  });

  it("truncates long bodies to one line", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_session_6",
        tool_name: "Bash",
        tool_input: {
          description:
            "This is a very long Codex permission request\nthat should be shortened before it reaches a watch notification display because the screen is tiny",
        },
      },
    });

    expect(formatted.notification.body).not.toContain("\n");
    expect(formatted.notification.body.length).toBeLessThanOrEqual(80);
    expect(formatted.notification.body.endsWith("...")).toBe(true);
  });

  it("throws a format error for unsupported Codex hook events", () => {
    expect(() =>
      formatCodexEvent({
        agent: "codex",
        raw: {
          hook_event_name: "PostToolUse",
          session_id: "codex_session_7",
        },
      }),
    ).toThrow("Unsupported Codex hook event: PostToolUse");
  });

  it("dispatches incoming events to the Codex formatter", () => {
    const formatted = formatIncomingEvent(
      {
        agent: "codex",
        raw: {
          hook_event_name: "Stop",
          session_id: "codex_session_8",
        },
      },
      { language: "zh" },
    );

    expect(formatted.kind).toBe("completed");
    expect(formatted.notification.group).toBe("Codex");
    expect(formatted.notification.title).toBe("待审阅");
  });

  it("prefixes Codex notification titles with the project name from cwd", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_project_1",
        cwd: "/Users/1874w/@1874/agent-notify",
        tool_name: "Bash",
        tool_input: {
          command: "pnpm test",
        },
      },
    });

    expect(formatted.notification.title).toBe("agent-notify Approve permission");
  });

  it("keeps Codex notification titles unchanged when cwd is missing", () => {
    const formatted = formatCodexEvent({
      agent: "codex",
      raw: {
        hook_event_name: "Stop",
        session_id: "codex_project_2",
      },
    });

    expect(formatted.notification.title).toBe("Ready to review");
  });

  it("uses options.cwd for the project prefix when provided, overriding raw.cwd", () => {
    const formatted = formatCodexEvent(
      {
        agent: "codex",
        raw: {
          hook_event_name: "Stop",
          session_id: "codex_1",
          cwd: "/Users/1874w/@1874/openclaw/sub",
          last_assistant_message: "done",
        },
      },
      { cwd: "/Users/1874w/@1874/openclaw" },
    );
    expect(formatted.notification.title).toContain("openclaw");
  });
});
