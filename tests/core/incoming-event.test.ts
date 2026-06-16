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
        agent: "claude",
        raw: { type: "permission.asked" },
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
