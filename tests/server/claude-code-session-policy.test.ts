import { describe, expect, it } from "vitest";
import { ClaudeCodeSessionPolicy } from "../../src/server/claude-code-session-policy.js";

function claudeEvent(hook_event_name: string, session_id = "session_1") {
  return {
    agent: "claude-code" as const,
    raw: { hook_event_name, session_id },
  };
}

function claudeNotification(notification_type: string, session_id = "session_1") {
  return {
    agent: "claude-code" as const,
    raw: { hook_event_name: "Notification", notification_type, session_id },
  };
}

describe("ClaudeCodeSessionPolicy", () => {
  it("records UserPromptSubmit without continuing to formatter", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(claudeEvent("UserPromptSubmit"), "macbook")).toEqual({
      action: "suppress",
      reason: "state_recorded",
      sourceEvent: "UserPromptSubmit",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("suppresses Stop before threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook");
    nowMs += 10_000;

    expect(policy.apply(claudeEvent("Stop"), "macbook")).toEqual({
      action: "suppress",
      reason: "below_threshold",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("continues Stop after threshold and deletes state", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook");
    nowMs += 121_000;

    expect(policy.apply(claudeEvent("Stop"), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("deletes state on StopFailure and continues", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook");

    expect(policy.apply(claudeEvent("StopFailure"), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses idle Notification prompts", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(claudeNotification("idle_prompt"), "macbook")).toEqual({
      action: "suppress",
      reason: "ignored_notification",
      sourceEvent: "Notification",
      sessionId: "session_1",
    });
  });

  it("continues permission Notification prompts", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(policy.apply(claudeNotification("permission_prompt"), "macbook")).toEqual({
      action: "continue",
    });
  });

  it("does not mix sessions across token names", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook");
    nowMs += 121_000;

    expect(policy.apply(claudeEvent("Stop"), "ubuntu")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(1);
  });

  it("prunes expired sessions", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      ttlMs: 100,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit", "old_session"), "macbook");
    nowMs += 101;
    policy.apply(claudeEvent("Notification", "new_session"), "macbook");

    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses Stop with completion_disabled when threshold is zero", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 0,
      nowMs: () => 1_000,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook");

    expect(policy.apply(claudeEvent("Stop"), "macbook")).toEqual({
      action: "suppress",
      reason: "completion_disabled",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("suppresses UserPromptSubmit without session_id and records no state", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        { agent: "claude-code", raw: { hook_event_name: "UserPromptSubmit" } },
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
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    expect(
      policy.apply(
        { agent: "claude-code", raw: { hook_event_name: "Stop" } },
        "macbook",
      ),
    ).toEqual({
      action: "suppress",
      reason: "missing_session",
      sourceEvent: "Stop",
    });
    expect(policy.sessionCount()).toBe(0);
  });

  it("drops oldest sessions above the max session cap", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      maxSessions: 2,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit", "session_1"), "macbook");
    nowMs += 1;
    policy.apply(claudeEvent("UserPromptSubmit", "session_2"), "macbook");
    nowMs += 1;
    policy.apply(claudeEvent("UserPromptSubmit", "session_3"), "macbook");

    expect(policy.sessionCount()).toBe(2);
    expect(policy.apply(claudeEvent("Stop", "session_1"), "macbook")).toEqual({
      action: "suppress",
      reason: "missing_start",
      sourceEvent: "Stop",
      sessionId: "session_1",
    });
  });
});
