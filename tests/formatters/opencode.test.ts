import { describe, expect, it } from "vitest";
import { formatIncomingEvent } from "../../src/formatters/index.js";
import { formatOpenCodeEvent } from "../../src/formatters/opencode.js";

describe("OpenCode formatter", () => {
  it("formats permission.v2.asked as a short approval notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_1",
        type: "permission.v2.asked",
        properties: {
          id: "perm_1",
          sessionID: "session_1",
          action: "bash",
          resources: ["pnpm test -- --runInBand"],
        },
      },
    });

    expect(formatted).toMatchObject({
      agent: "opencode",
      kind: "permission_required",
      sourceEvent: "permission.v2.asked",
      sessionId: "session_1",
      notification: {
        title: "Approve bash",
        body: "pnpm test -- --runInBand",
        urgency: "normal",
        group: "OpenCode",
        icon: "https://opencode.ai/apple-touch-icon.png",
      },
    });
    expect(formatted.notification.title).not.toContain("OpenCode");
    expect(formatted.notification.body).not.toContain("\n");
  });

  it("formats permission.asked as a short approval notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_2",
        type: "permission.asked",
        properties: {
          id: "perm_2",
          sessionID: "session_2",
          permission: "edit",
          patterns: ["src/server/app.ts"],
          metadata: {},
          always: [],
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "permission_required",
      sourceEvent: "permission.asked",
      sessionId: "session_2",
      notification: {
        title: "Approve edit",
        body: "src/server/app.ts",
        urgency: "normal",
        group: "OpenCode",
        icon: "https://opencode.ai/apple-touch-icon.png",
      },
    });
  });

  it("formats session.error with a short error body", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_3",
        type: "session.error",
        properties: {
          sessionID: "session_3",
          error: {
            name: "ApiError",
            message: "Provider returned HTTP 500 while streaming the response",
          },
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "failed",
      sourceEvent: "session.error",
      sessionId: "session_3",
      notification: {
        title: "Failed",
        body: "Provider returned HTTP 500 while streaming the response",
        urgency: "time_sensitive",
        group: "OpenCode",
      },
    });
  });

  it("truncates long body text to one line", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_4",
        type: "permission.v2.asked",
        properties: {
          id: "perm_4",
          sessionID: "session_4",
          action: "bash",
          resources: [
            "printf 'this is a very long command that should be shortened before it reaches a watch notification display'",
          ],
        },
      },
    });

    expect(formatted.notification.body).not.toContain("\n");
    expect(formatted.notification.body.length).toBeLessThanOrEqual(80);
    expect(formatted.notification.body.endsWith("...")).toBe(true);
  });

  it("throws a format error for unsupported OpenCode event types", () => {
    expect(() =>
      formatOpenCodeEvent({
        agent: "opencode",
        raw: {
          id: "evt_5",
          type: "message.updated",
          properties: {},
        },
      }),
    ).toThrow("Unsupported OpenCode event type: message.updated");
  });

  it("dispatches incoming events to the OpenCode formatter", () => {
    const formatted = formatIncomingEvent({
      agent: "opencode",
      raw: {
        id: "evt_6",
        type: "permission.v2.asked",
        properties: {
          id: "perm_6",
          sessionID: "session_6",
          action: "webfetch",
          resources: ["https://example.com"],
        },
      },
    });

    expect(formatted.notification.title).toBe("Approve webfetch");
  });
});
