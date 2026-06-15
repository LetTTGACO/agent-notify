import { describe, expect, it, vi } from "vitest";
import { mapOpenCodeEvent, sendOpenCodeEvent } from "../../src/adapters/opencode/map-event.js";

describe("OpenCode adapter", () => {
  it("maps permission.asked to permission_required", () => {
    expect(
      mapOpenCodeEvent("permission.asked", {
        sessionID: "s1",
        cwd: "/Users/me/agent-notify",
      }),
    ).toMatchObject({
      agent: "opencode",
      kind: "permission_required",
      sourceEvent: "permission.asked",
      sessionId: "s1",
      project: "agent-notify",
    });
  });

  it("does not map allowed permission replies", () => {
    expect(mapOpenCodeEvent("permission.replied", { status: "allowed" })).toBeNull();
  });

  it("fails safe when server is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      sendOpenCodeEvent(
        { serverUrl: "http://localhost:8787", token: "secret", timeoutMs: 1 },
        { agent: "opencode", kind: "attention", title: "Hi" },
        fetchMock,
      ),
    ).resolves.toEqual({ ok: false, error: "offline" });
  });
});
