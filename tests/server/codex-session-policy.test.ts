import { describe, expect, it } from "vitest";
import { CodexSessionPolicy } from "../../src/server/codex-session-policy.js";

function codexEvent(hook_event_name: string, session_id = "session_1") {
  return {
    agent: "codex" as const,
    raw: { hook_event_name, session_id },
  };
}

describe("CodexSessionPolicy", () => {
  it("records UserPromptSubmit without continuing to formatter", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(codexEvent("UserPromptSubmit"), "macbook")).toEqual({
      action: "suppress",
      reason: "state_recorded",
      sourceEvent: "UserPromptSubmit",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("suppresses Stop before threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(codexEvent("UserPromptSubmit"), "macbook");
    nowMs += 10_000;

    expect(policy.apply(codexEvent("Stop"), "macbook")).toEqual({
      action: "suppress",
      reason: "below_threshold",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("continues Stop after threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(codexEvent("UserPromptSubmit"), "macbook");
    nowMs += 121_000;

    expect(policy.apply(codexEvent("Stop"), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses bypassed PermissionRequest events", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        {
          agent: "codex",
          raw: {
            hook_event_name: "PermissionRequest",
            permission_mode: "bypassPermissions",
            session_id: "session_1",
          },
        },
        "macbook",
      ),
    ).toEqual({
      action: "suppress",
      reason: "permission_bypassed",
      sourceEvent: "PermissionRequest",
      sessionId: "session_1",
    });
  });

  it("suppresses Stop with completion_disabled when threshold is zero", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 0,
      nowMs: () => 1_000,
    });

    policy.apply(codexEvent("UserPromptSubmit"), "macbook");

    expect(policy.apply(codexEvent("Stop"), "macbook")).toEqual({
      action: "suppress",
      reason: "completion_disabled",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses UserPromptSubmit without session_id and records no state", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        { agent: "codex", raw: { hook_event_name: "UserPromptSubmit" } },
        "macbook",
      ),
    ).toEqual({
      action: "suppress",
      reason: "missing_session",
      sourceEvent: "UserPromptSubmit",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses Stop without session_id and records no state", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        { agent: "codex", raw: { hook_event_name: "Stop" } },
        "macbook",
      ),
    ).toEqual({
      action: "suppress",
      reason: "missing_session",
      sourceEvent: "Stop",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses Stop when the matching UserPromptSubmit was not recorded", () => {
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(codexEvent("Stop"), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
  });

  it("does not mix sessions across token names", () => {
    let nowMs = 1_000;
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(codexEvent("UserPromptSubmit"), "macbook");
    nowMs += 121_000;

    expect(policy.apply(codexEvent("Stop"), "ubuntu")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("prunes expired sessions", () => {
    let nowMs = 1_000;
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      ttlMs: 100,
      nowMs: () => nowMs,
    });

    policy.apply(codexEvent("UserPromptSubmit", "old_session"), "macbook");
    nowMs += 101;
    policy.apply(codexEvent("PermissionRequest", "new_session"), "macbook");

    expect(policy.sessionCount()).toBe(0);
  });

  it("drops oldest sessions above the max session cap", () => {
    let nowMs = 1_000;
    const policy = new CodexSessionPolicy({
      completionMinSeconds: 120,
      maxSessions: 2,
      nowMs: () => nowMs,
    });

    policy.apply(codexEvent("UserPromptSubmit", "session_1"), "macbook");
    nowMs += 1;
    policy.apply(codexEvent("UserPromptSubmit", "session_2"), "macbook");
    nowMs += 1;
    policy.apply(codexEvent("UserPromptSubmit", "session_3"), "macbook");

    expect(policy.sessionCount()).toBe(2);
    expect(policy.apply(codexEvent("Stop", "session_1"), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
  });
});
