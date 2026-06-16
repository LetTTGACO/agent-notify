import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app.js";
import type { NotificationProvider } from "../../src/providers/types.js";

function provider(): NotificationProvider {
  return {
    name: "mock",
    send: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
  };
}

function appOptions(mockProvider = provider()) {
  return {
    tokens: [{ name: "macbook", value: "secret" }],
    provider: mockProvider,
    logPath: "./data/test.jsonl",
    logRaw: false,
    language: "en" as const,
  };
}

const permissionEnvelope = {
  agent: "opencode",
  raw: {
    id: "evt_1",
    type: "permission.v2.asked",
    properties: {
      id: "perm_1",
      sessionID: "session_1",
      action: "bash",
      resources: ["pnpm test"],
    },
  },
};

describe("server app", () => {
  it("rejects missing auth", async () => {
    const app = createApp(appOptions());

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("accepts a raw OpenCode event and sends formatted provider notification", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "Approve bash",
      body: "pnpm test",
      urgency: "time_sensitive",
      group: "OpenCode",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });
  });

  it("sends Chinese formatted notifications when configured", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      language: "zh",
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(mockProvider.send).toHaveBeenCalledWith({
      title: "批准运行命令",
      body: "pnpm test",
      urgency: "time_sensitive",
      group: "OpenCode",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });
  });

  it("rejects the old normalized payload", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "opencode",
        kind: "attention",
        title: "Hi",
        project: "agent-notify",
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(400);
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("rejects malformed OpenCode raw events", async () => {
    const mockProvider = provider();
    const app = createApp(appOptions(mockProvider));

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({
        agent: "opencode",
        raw: {
          id: "evt_2",
          properties: {},
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(400);
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("reports health without secrets", async () => {
    const app = createApp(appOptions());

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      provider: "mock",
      logPath: "./data/test.jsonl",
    });
  });

  it("does not fail /events when logger cannot write", async () => {
    const mockProvider = provider();
    const app = createApp({
      ...appOptions(mockProvider),
      logPath: "/dev/null/should-not-exist/events.jsonl",
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify(permissionEnvelope),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledOnce();
  });
});
