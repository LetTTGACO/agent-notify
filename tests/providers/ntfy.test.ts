import { describe, expect, it, vi } from "vitest";
import { NtfyProvider } from "../../src/providers/ntfy.js";

describe("NtfyProvider", () => {
  it("posts an ntfy JSON payload with default priority", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abc", event: "message" }), {
        status: 200,
      }),
    );
    const provider = new NtfyProvider("https://ntfy.sh/agent_notify_xxx", undefined, fetchMock);

    const result = await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
      group: "Codex",
      url: "https://example.com/session",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.sh/",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      topic: "agent_notify_xxx",
      title: "Title",
      message: "Body",
      priority: 3,
      tags: ["Codex"],
      click: "https://example.com/session",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });
  });

  it("maps time-sensitive urgency to high priority", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const provider = new NtfyProvider("https://ntfy.sh/topic", undefined, fetchMock);

    await provider.send({
      title: "Approve",
      body: "pnpm test",
      urgency: "time_sensitive",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.priority).toBe(4);
  });

  it("uses the title as message when body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const provider = new NtfyProvider("https://ntfy.sh/topic", undefined, fetchMock);

    await provider.send({
      title: "Done",
      body: "",
      urgency: "normal",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.message).toBe("Done");
  });

  it("sends bearer auth when a token is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const provider = new NtfyProvider("https://ntfy.example.com/secure", "tk_secret", fetchMock);

    await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ntfy.example.com/",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          authorization: "Bearer tk_secret",
        },
      }),
    );
  });

  it("returns failed result on non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    const provider = new NtfyProvider("https://ntfy.sh/topic", undefined, fetchMock);

    const result = await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("ntfy returned HTTP 401");
  });

  it("returns failed result when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const provider = new NtfyProvider("https://ntfy.sh/topic", undefined, fetchMock);

    const result = await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("network down");
  });

  it("rejects endpoints without a topic", () => {
    expect(() => new NtfyProvider("https://ntfy.sh/")).toThrow(
      "NTFY_ENDPOINT must include a topic path",
    );
  });
});
