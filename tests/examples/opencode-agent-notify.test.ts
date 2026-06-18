import { describe, expect, it } from "vitest";
import {
  addOpenCodeCwd,
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

  it("adds top-level cwd to OpenCode raw events before forwarding", () => {
    const raw = {
      id: "evt_project_1",
      type: "question.asked",
      properties: {
        sessionID: "session_project_1",
      },
    };

    expect(addOpenCodeCwd(raw, "/Users/1874w/@1874/agent-notify")).toEqual({
      ...raw,
      cwd: "/Users/1874w/@1874/agent-notify",
    });
  });

  it("does not override an existing string cwd on OpenCode raw events", () => {
    const raw = {
      id: "evt_project_2",
      type: "question.asked",
      cwd: "/tmp/existing-project",
      properties: {
        sessionID: "session_project_2",
      },
    };

    expect(addOpenCodeCwd(raw, "/Users/1874w/@1874/agent-notify")).toEqual(raw);
  });

  it("leaves non-object OpenCode raw values unchanged when adding cwd", () => {
    expect(addOpenCodeCwd("not-an-object", "/Users/1874w/project")).toBe(
      "not-an-object",
    );
  });
});
