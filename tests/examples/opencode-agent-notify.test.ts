import { describe, expect, it } from "vitest";
import {
  createOpenCodeNotificationFilter,
  shouldNotify,
  summarizeOpenCodeEventForDebug,
} from "../../examples/opencode/agent-notify.js";

describe("OpenCode plugin example", () => {
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

  it("keeps the notification allowlist narrow", () => {
    expect(shouldNotify({ type: "permission.asked" })).toBe(true);
    expect(shouldNotify({ type: "question.asked" })).toBe(true);
    expect(shouldNotify({ type: "message.updated" })).toBe(false);
  });

  it("notifies when a busy session idles after the completion threshold", () => {
    let nowMs = 1_000;
    const filter = createOpenCodeNotificationFilter({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    expect(
      filter.shouldNotify({
        type: "session.status",
        properties: {
          sessionID: "session_1",
          status: { type: "busy" },
        },
      }),
    ).toBe(false);

    nowMs += 121_000;

    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(true);
  });

  it("keeps the original busy time when OpenCode emits repeated busy statuses", () => {
    let nowMs = 1_000;
    const filter = createOpenCodeNotificationFilter({
      completionMinSeconds: 30,
      nowMs: () => nowMs,
    });

    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });

    nowMs += 31_000;
    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });

    nowMs += 2;
    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(true);
  });

  it("does not notify for completion when the threshold is disabled", () => {
    const filter = createOpenCodeNotificationFilter({
      completionMinSeconds: 0,
      nowMs: () => 1_000,
    });

    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });

    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(false);
  });

  it("does not notify later for a repeated idle after a short session", () => {
    let nowMs = 1_000;
    const filter = createOpenCodeNotificationFilter({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });

    nowMs += 10_000;
    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(false);

    nowMs += 120_000;
    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(false);
  });

  it("suppresses completion after a session error until the session is busy again", () => {
    let nowMs = 1_000;
    const filter = createOpenCodeNotificationFilter({
      completionMinSeconds: 30,
      nowMs: () => nowMs,
    });

    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });

    nowMs += 35_000;

    expect(
      filter.shouldNotify({
        type: "session.error",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(true);

    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(false);

    nowMs += 1_000;
    filter.shouldNotify({
      type: "session.status",
      properties: {
        sessionID: "session_1",
        status: { type: "busy" },
      },
    });
    nowMs += 31_000;

    expect(
      filter.shouldNotify({
        type: "session.idle",
        properties: {
          sessionID: "session_1",
        },
      }),
    ).toBe(true);
  });
});
