import { describe, expect, it } from "vitest";
import { agentEventSchema, parseAgentEvent } from "../../src/core/events.js";

describe("AgentEvent schema", () => {
  it("accepts a minimal OpenCode permission event", () => {
    const event = parseAgentEvent({
      agent: "opencode",
      kind: "permission_required",
      title: "OpenCode needs permission",
    });

    expect(event.agent).toBe("opencode");
    expect(event.kind).toBe("permission_required");
    expect(event.title).toBe("OpenCode needs permission");
  });

  it("rejects an unknown event kind", () => {
    expect(() =>
      parseAgentEvent({
        agent: "opencode",
        kind: "noise",
        title: "Bad event",
      }),
    ).toThrow();
  });

  it("keeps optional diagnostic fields", () => {
    const result = agentEventSchema.parse({
      agent: "opencode",
      kind: "failed",
      title: "Session error",
      message: "Tool failed",
      project: "agent-notify",
      sessionId: "session-1",
      cwd: "/Users/me/project",
      sourceEvent: "session.error",
      createdAt: "2026-06-15T00:00:00.000Z",
      raw: { nested: true },
    });

    expect(result.project).toBe("agent-notify");
    expect(result.raw).toEqual({ nested: true });
  });
});
