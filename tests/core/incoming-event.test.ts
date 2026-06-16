import { describe, expect, it } from "vitest";
import {
  incomingAgentEventSchema,
  parseIncomingAgentEvent,
} from "../../src/core/incoming-event.js";

describe("IncomingAgentEvent schema", () => {
  it("accepts an OpenCode raw envelope", () => {
    const event = parseIncomingAgentEvent({
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
    });

    expect(event.agent).toBe("opencode");
    expect(event.raw).toMatchObject({ type: "permission.v2.asked" });
  });

  it("accepts a Claude Code raw envelope", () => {
    const event = parseIncomingAgentEvent({
      agent: "claude-code",
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id: "claude_session_1",
        message: "Claude needs your permission",
      },
    });

    expect(event.agent).toBe("claude-code");
    expect(event.raw).toMatchObject({ hook_event_name: "Notification" });
  });

  it("accepts a Codex raw envelope", () => {
    const event = parseIncomingAgentEvent({
      agent: "codex",
      raw: {
        hook_event_name: "PermissionRequest",
        session_id: "codex_session_1",
        tool_name: "Bash",
        tool_input: {
          command: "pnpm test",
          description: "Codex needs to run tests",
        },
      },
    });

    expect(event.agent).toBe("codex");
    expect(event.raw).toMatchObject({ hook_event_name: "PermissionRequest" });
  });

  it("rejects the old normalized AgentEvent contract", () => {
    expect(() =>
      parseIncomingAgentEvent({
        agent: "opencode",
        kind: "attention",
        title: "Hi",
        project: "agent-notify",
      }),
    ).toThrow();
  });

  it("rejects unsupported agent names in this MVP", () => {
    expect(() =>
      incomingAgentEventSchema.parse({
        agent: "gemini",
        raw: { hook_event_name: "Notification" },
      }),
    ).toThrow();
  });

  it("requires the raw key to be present", () => {
    expect(() =>
      incomingAgentEventSchema.parse({
        agent: "opencode",
      }),
    ).toThrow("raw is required");
  });
});
