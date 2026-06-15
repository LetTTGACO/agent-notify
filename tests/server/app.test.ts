import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app.js";
import type { NotificationProvider } from "../../src/providers/types.js";

function provider(): NotificationProvider {
  return {
    name: "mock",
    send: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
  };
}

describe("server app", () => {
  it("rejects missing auth", async () => {
    const app = createApp({
      tokens: [{ name: "macbook", value: "secret" }],
      provider: provider(),
      logPath: "./data/test.jsonl",
      logRaw: false,
      dedupeSeconds: 30,
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({ agent: "opencode", kind: "attention", title: "Hi" }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("accepts a valid event and sends provider notification", async () => {
    const mockProvider = provider();
    const app = createApp({
      tokens: [{ name: "macbook", value: "secret" }],
      provider: mockProvider,
      logPath: "./data/test.jsonl",
      logRaw: false,
      dedupeSeconds: 30,
    });

    const res = await app.request("/events", {
      method: "POST",
      body: JSON.stringify({ agent: "opencode", kind: "attention", title: "Hi" }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(mockProvider.send).toHaveBeenCalledOnce();
  });

  it("reports health without secrets", async () => {
    const app = createApp({
      tokens: [{ name: "macbook", value: "secret" }],
      provider: provider(),
      logPath: "./data/test.jsonl",
      logRaw: false,
      dedupeSeconds: 30,
    });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      provider: "mock",
      logPath: "./data/test.jsonl",
    });
  });
});
