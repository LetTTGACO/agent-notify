import { describe, expect, it } from "vitest";
import { formatNotification } from "../../src/core/format.js";

describe("formatNotification", () => {
  it("marks permission events as time sensitive", () => {
    const payload = formatNotification({
      agent: "opencode",
      kind: "permission_required",
      title: "Permission needed",
      project: "agent-notify",
      cwd: "/Users/me/@1874/agent-notify",
    });

    expect(payload.urgency).toBe("time_sensitive");
    expect(payload.group).toBe("AgentNotify");
    expect(payload.body).toContain("agent-notify");
    expect(payload.body).not.toContain("/Users/me/@1874");
  });
});
