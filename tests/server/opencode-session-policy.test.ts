import { describe, expect, it } from "vitest";
import { OpenCodeSessionPolicy } from "../../src/server/opencode-session-policy.js";

function statusEvent(sessionID = "session_1", statusType = "busy") {
  return {
    agent: "opencode" as const,
    raw: {
      type: "session.status",
      properties: { sessionID, status: { type: statusType } },
    },
  };
}

function idleEvent(sessionID = "session_1") {
  return {
    agent: "opencode" as const,
    raw: { type: "session.idle", properties: { sessionID } },
  };
}

function errorEvent(sessionID = "session_1") {
  return {
    agent: "opencode" as const,
    raw: { type: "session.error", properties: { sessionID } },
  };
}

function opencodeBusyEvent(cwd: string, sessionID = "session_1") {
  return {
    agent: "opencode" as const,
    raw: {
      type: "session.status",
      cwd,
      properties: { sessionID, status: { type: "busy" } },
    },
  };
}

function opencodeIdleEvent(cwd: string, sessionID = "session_1") {
  return {
    agent: "opencode" as const,
    raw: {
      type: "session.idle",
      cwd,
      properties: { sessionID },
    },
  };
}

describe("OpenCodeSessionPolicy", () => {
  it("records busy session.status without continuing to formatter", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(statusEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "state_recorded",
      sourceEvent: "session.status",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("does not reset start time on repeated busy statuses", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 30,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent(), "macbook");
    nowMs += 31_000;
    policy.apply(statusEvent(), "macbook"); // repeated busy, must not reset
    nowMs += 2;

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "continue",
    });
  });

  it("suppresses idle before threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent(), "macbook");
    nowMs += 10_000;

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "below_threshold",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("continues idle after threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent(), "macbook");
    nowMs += 121_000;

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses idle with completion_disabled when threshold is zero", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 0,
      nowMs: () => 1_000,
    });

    policy.apply(statusEvent(), "macbook");

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "completion_disabled",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses idle when the matching busy was not recorded", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
  });

  it("continues session.error and deletes state so a later idle is missing_start", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 30,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent(), "macbook");
    nowMs += 35_000;

    expect(policy.apply(errorEvent(), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.sessionCount()).toBe(0);

    expect(policy.apply(idleEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
  });

  it("suppresses non-busy session.status as ignored_status", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(statusEvent("session_1", "idle"), "macbook")).toEqual({
      action: "suppress",
      reason: "ignored_status",
      sourceEvent: "session.status",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("continues permission/question events untouched", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        {
          agent: "opencode",
          raw: {
            type: "permission.v2.asked",
            properties: { sessionID: "session_1", action: "bash" },
          },
        },
        "macbook",
      ),
    ).toEqual({ action: "continue" });
  });

  it("passes through claude-code and codex events", () => {
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        { agent: "claude-code", raw: { hook_event_name: "Stop", session_id: "s" } },
        "macbook",
      ),
    ).toEqual({ action: "continue" });
    expect(
      policy.apply(
        { agent: "codex", raw: { hook_event_name: "Stop", session_id: "s" } },
        "macbook",
      ),
    ).toEqual({ action: "continue" });
  });

  it("does not mix sessions across token names", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent(), "macbook");
    nowMs += 121_000;

    expect(policy.apply(idleEvent(), "ubuntu")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("prunes expired sessions", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      ttlMs: 100,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent("old_session"), "macbook");
    nowMs += 101;
    policy.apply(statusEvent("new_session"), "macbook");

    expect(policy.sessionCount()).toBe(1);
  });

  it("drops oldest sessions above the max session cap", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      maxSessions: 2,
      nowMs: () => nowMs,
    });

    policy.apply(statusEvent("session_1"), "macbook");
    nowMs += 1;
    policy.apply(statusEvent("session_2"), "macbook");
    nowMs += 1;
    policy.apply(statusEvent("session_3"), "macbook");

    expect(policy.sessionCount()).toBe(2);
    expect(policy.apply(idleEvent("session_1"), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "session.idle",
      sessionId: "session_1",
    });
  });

  it("pins the first-seen cwd on continue decisions and ignores later cwd changes", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(opencodeBusyEvent("/Users/1874w/@1874/openclaw"), "macbook");
    nowMs += 121_000;

    const idle = policy.apply(
      opencodeIdleEvent("/Users/1874w/@1874/openclaw/extensions/feishu/src"),
      "macbook",
    );
    expect(idle).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });
  });

  it("keeps pinned cwd across turns", () => {
    let nowMs = 1_000;
    const policy = new OpenCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(opencodeBusyEvent("/Users/1874w/@1874/openclaw"), "macbook");
    nowMs += 121_000;
    policy.apply(opencodeIdleEvent("/Users/1874w/@1874/openclaw/sub"), "macbook");

    nowMs += 1_000;
    policy.apply(opencodeBusyEvent("/Users/1874w/@1874/openclaw/other"), "macbook");
    nowMs += 121_000;
    const idle = policy.apply(
      opencodeIdleEvent("/Users/1874w/@1874/openclaw/other/sub"),
      "macbook",
    );
    expect(idle).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });
  });
});
