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

function claudeCwdEvent(hook_event_name: string, cwd: string, session_id = "session_1") {
  return {
    agent: "claude-code" as const,
    raw: { hook_event_name, session_id, cwd },
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

  it("pins the first-seen cwd on continue decisions and ignores later cwd changes", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeCwdEvent("UserPromptSubmit", "/Users/1874w/@1874/openclaw"), "macbook");
    nowMs += 121_000;

    // Stop event arrives with a drifted cwd (subtask directory); pinned cwd must win.
    const stop = policy.apply(
      claudeCwdEvent("Stop", "/Users/1874w/@1874/openclaw/extensions/feishu/src"),
      "macbook",
    );
    expect(stop).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });
  });

  it("pins cwd from the next event when the first event carried no cwd", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeEvent("UserPromptSubmit"), "macbook"); // no cwd
    nowMs += 121_000;

    const stop = policy.apply(claudeCwdEvent("Stop", "/Users/1874w/@1874/openclaw"), "macbook");
    expect(stop).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });
  });

  it("returns undefined cwd when there is no session_id", () => {
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => 1_000,
    });

    const stop = policy.apply(
      { agent: "claude-code", raw: { hook_event_name: "Stop", cwd: "/x/y" } },
      "macbook",
    );
    // No session_id -> suppress missing_session; cwd is undefined (suppress variant has no cwd).
    expect(stop.action).toBe("suppress");
  });

  it("keeps pinned cwd across turns (Stop does not delete cwdBySession)", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      nowMs: () => nowMs,
    });

    policy.apply(claudeCwdEvent("UserPromptSubmit", "/Users/1874w/@1874/openclaw"), "macbook");
    nowMs += 121_000;
    policy.apply(claudeCwdEvent("Stop", "/Users/1874w/@1874/openclaw/sub"), "macbook"); // deletes sessions, keeps cwdBySession

    // Second turn: UserPromptSubmit with a different cwd, but the pinned one should already exist.
    nowMs += 1_000;
    policy.apply(claudeCwdEvent("UserPromptSubmit", "/Users/1874w/@1874/openclaw/other"), "macbook");
    nowMs += 121_000;
    const stop = policy.apply(
      claudeCwdEvent("Stop", "/Users/1874w/@1874/openclaw/other/sub"),
      "macbook",
    );
    expect(stop).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });
  });

  it("prunes pinned cwd after TTL and re-pins a fresh cwd", () => {
    let nowMs = 1_000;
    const policy = new ClaudeCodeSessionPolicy({
      completionMinSeconds: 120,
      ttlMs: 100,
      nowMs: () => nowMs,
    });

    const permissionPrompt = (cwd: string, session_id = "session_1") => ({
      agent: "claude-code" as const,
      raw: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
        session_id,
        cwd,
      },
    });

    // Pin session_1's cwd via a permission_prompt Notification (continues immediately,
    // independent of session state / completion threshold).
    expect(policy.apply(permissionPrompt("/Users/1874w/@1874/openclaw"), "macbook")).toEqual({
      action: "continue",
      cwd: "/Users/1874w/@1874/openclaw",
    });

    nowMs += 101;
    // A different session triggers prune(); session_1's pinned cwd is now older
    // than ttlMs (101 > 100) and is dropped from cwdBySession.
    policy.apply(permissionPrompt("/x/new", "session_2"), "macbook");

    // Same session_1 arrives again with a drifted cwd. Because the stale pin was
    // pruned, resolveCwd re-pins to the drifted cwd — proving the stale pin was dropped.
    expect(policy.apply(permissionPrompt("/x/drifted"), "macbook")).toEqual({
      action: "continue",
      cwd: "/x/drifted",
    });
  });
});
