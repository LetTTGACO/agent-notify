import { describe, expect, it, vi } from "vitest";
import {
  sendOpenCodeEvent,
  shouldNotifyOpenCodeEvent,
} from "../../src/adapters/opencode/map-event.js";
import { readOpenCodeConfig } from "../../src/adapters/opencode/config.js";

describe("OpenCode adapter", () => {
  it("only forwards hooks that need notifications", () => {
    expect(shouldNotifyOpenCodeEvent({ type: "permission.v2.asked" })).toBe(true);
    expect(shouldNotifyOpenCodeEvent({ type: "permission.asked" })).toBe(true);
    expect(shouldNotifyOpenCodeEvent({ type: "session.error" })).toBe(true);
    expect(shouldNotifyOpenCodeEvent({ type: "permission.replied" })).toBe(false);
    expect(shouldNotifyOpenCodeEvent({ type: "permission.v2.replied" })).toBe(false);
    expect(shouldNotifyOpenCodeEvent({ type: "session.idle" })).toBe(false);
  });

  it("sends the raw event in a strict opencode envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const raw = {
      id: "evt_1",
      type: "permission.v2.asked",
      properties: {
        id: "perm_1",
        sessionID: "session_1",
        action: "bash",
        resources: ["pnpm test"],
      },
    };

    await expect(
      sendOpenCodeEvent(
        { serverUrl: "http://localhost:8787", token: "secret", timeoutMs: 1000 },
        raw,
        fetchMock,
      ),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      agent: "opencode",
      raw,
    });
  });

  it("fails safe when server is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      sendOpenCodeEvent(
        { serverUrl: "http://localhost:8787", token: "secret", timeoutMs: 1 },
        { type: "permission.asked" },
        fetchMock,
      ),
    ).resolves.toEqual({ ok: false, error: "offline" });
  });

  it("does not read project or includeRaw adapter config", () => {
    const config = readOpenCodeConfig({
      AGENT_NOTIFY_SERVER_URL: "http://server",
      AGENT_NOTIFY_TOKEN: "token",
      AGENT_NOTIFY_PROJECT: "ignored",
      AGENT_NOTIFY_INCLUDE_RAW: "false",
      AGENT_NOTIFY_TIMEOUT_MS: "1234",
    });

    expect(config).toEqual({
      serverUrl: "http://server",
      token: "token",
      timeoutMs: 1234,
    });
  });
});
