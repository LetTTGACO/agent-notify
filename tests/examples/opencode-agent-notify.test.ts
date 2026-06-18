import { describe, expect, it } from "vitest";
import {
  parseAgentNotifyConfig,
  shouldNotify,
  summarizeOpenCodeEventForDebug,
} from "../../examples/opencode/agent-notify.js";

describe("OpenCode plugin example", () => {
  it("defaults timeoutMs to 2000 when not configured", () => {
    const config = parseAgentNotifyConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
    });

    expect(config.timeoutMs).toBe(2_000);
  });

  it("uses the configured timeoutMs", () => {
    const config = parseAgentNotifyConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
      timeoutMs: 5_000,
    });

    expect(config.timeoutMs).toBe(5_000);
  });

  it("summarizes every event for plugin-side debug logs", () => {
    const raw = {
      type: "message.updated",
      sessionID: "session_1",
      properties: {
        sessionID: "session_2",
        messageID: "message_1",
      },
    };

    expect(
      summarizeOpenCodeEventForDebug(raw),
    ).toEqual({
      type: "message.updated",
      raw,
    });
  });

  it("forwards notification-worthy events and busy status, drops the rest", () => {
    expect(shouldNotify({ type: "permission.asked" })).toBe(true);
    expect(shouldNotify({ type: "permission.v2.asked" })).toBe(true);
    expect(shouldNotify({ type: "question.asked" })).toBe(true);
    expect(shouldNotify({ type: "session.error" })).toBe(true);
    expect(shouldNotify({ type: "session.idle" })).toBe(true);
    expect(
      shouldNotify({
        type: "session.status",
        properties: { status: { type: "busy" } },
      }),
    ).toBe(true);

    expect(shouldNotify({ type: "message.updated" })).toBe(false);
    expect(
      shouldNotify({
        type: "session.status",
        properties: { status: { type: "idle" } },
      }),
    ).toBe(false);
    expect(shouldNotify({ type: "session.status" })).toBe(false);
  });
});
