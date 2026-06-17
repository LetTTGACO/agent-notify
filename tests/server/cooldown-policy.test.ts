import { describe, expect, it } from "vitest";
import { CooldownPolicy } from "../../src/server/cooldown-policy.js";
import type { FormattedAgentEvent } from "../../src/core/formatted-event.js";

function permissionEvent(
  agent: FormattedAgentEvent["agent"] = "claude-code",
  sessionId = "session_1",
): FormattedAgentEvent {
  return {
    agent,
    kind: "permission_required",
    sourceEvent: "Notification",
    sessionId,
    notification: {
      title: "Approve permission",
      body: "x",
      urgency: "time_sensitive",
      group: "Claude Code",
      icon: "https://claude.ai/favicon.ico",
    },
  };
}

function completedEvent(sessionId = "session_1"): FormattedAgentEvent {
  return {
    agent: "claude-code",
    kind: "completed",
    sourceEvent: "Stop",
    sessionId,
    notification: {
      title: "Ready to review",
      body: "x",
      urgency: "time_sensitive",
      group: "Claude Code",
      icon: "https://claude.ai/favicon.ico",
    },
  };
}

describe("CooldownPolicy", () => {
  it("always continues when cooldownSeconds is zero (disabled)", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 0, nowMs: () => nowMs });

    expect(policy.apply(permissionEvent(), "macbook")).toEqual({ action: "continue" });
    nowMs += 1_000;
    expect(policy.apply(permissionEvent(), "macbook")).toEqual({ action: "continue" });
  });

  it("continues non-interactive kinds without recording state", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });

    expect(policy.apply(completedEvent(), "macbook")).toEqual({ action: "continue" });
    nowMs += 1_000;
    // A completed event must not trigger cooldown for a later permission.
    expect(policy.apply(permissionEvent(), "macbook")).toEqual({ action: "continue" });
  });

  it("lets the first interaction through and suppresses the next within the window", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });

    expect(policy.apply(permissionEvent(), "macbook")).toEqual({ action: "continue" });
    nowMs += 3_000;
    expect(policy.apply(permissionEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "cooldown",
      kind: "permission_required",
      sessionId: "session_1",
    });
  });

  it("lets an event through once the window has elapsed and refreshes the window", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });

    policy.apply(permissionEvent(), "macbook");
    nowMs += 10_000;
    expect(policy.apply(permissionEvent(), "macbook")).toEqual({ action: "continue" });
    nowMs += 3_000;
    expect(policy.apply(permissionEvent(), "macbook")).toEqual({
      action: "suppress",
      reason: "cooldown",
      kind: "permission_required",
      sessionId: "session_1",
    });
  });

  it("stays suppressed throughout a burst and recovers only after an idle gap (sliding window)", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });

    // First event notifies and starts the window.
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("continue");
    // Burst: each event arrives within the window of the last event, so every
    // one is suppressed but still refreshes the window.
    nowMs += 4_000;
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("suppress");
    nowMs += 4_000;
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("suppress");
    nowMs += 4_000;
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("suppress");
    // Still within a refreshed window (last event was at t=17000).
    nowMs += 4_000;
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("suppress");
    // Now idle for longer than the window: next event notifies and refreshes.
    nowMs += 11_000;
    expect(policy.apply(permissionEvent(), "macbook").action).toBe("continue");
  });

  it("passes through when sessionId is missing (cannot key)", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });
    const noSession: FormattedAgentEvent = {
      ...permissionEvent(),
      sessionId: undefined,
    };

    expect(policy.apply(noSession, "macbook")).toEqual({ action: "continue" });
    nowMs += 1_000;
    expect(policy.apply(noSession, "macbook")).toEqual({ action: "continue" });
  });

  it("does not mix keys across token / agent / session", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({ cooldownSeconds: 10, nowMs: () => nowMs });

    policy.apply(permissionEvent("claude-code", "session_1"), "macbook");
    nowMs += 1_000;
    expect(policy.apply(permissionEvent("claude-code", "session_2"), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.apply(permissionEvent("codex", "session_1"), "macbook")).toEqual({
      action: "continue",
    });
    expect(policy.apply(permissionEvent("claude-code", "session_1"), "ubuntu")).toEqual({
      action: "continue",
    });
  });

  it("prunes entries older than ttlMs", () => {
    let nowMs = 1_000;
    const policy = new CooldownPolicy({
      cooldownSeconds: 10,
      ttlMs: 100,
      nowMs: () => nowMs,
    });

    policy.apply(permissionEvent("claude-code", "old"), "macbook");
    nowMs += 101;
    // A different key triggers prune; old key should be gone, so old session
    // notifies again as if first-seen.
    expect(policy.apply(permissionEvent("claude-code", "old"), "macbook")).toEqual({
      action: "continue",
    });
  });
});
