import { describe, expect, it, vi } from "vitest";
import { BarkProvider } from "../../src/providers/bark.js";

describe("BarkProvider", () => {
  it("posts a Bark payload with active level and icon", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 200 }), { status: 200 }),
    );
    const provider = new BarkProvider("https://api.day.app/device-key", fetchMock);

    const result = await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
      group: "AgentNotify",
      sound: "default",
      icon: "https://opencode.ai/apple-touch-icon.png",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.day.app/device-key",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title).toBe("Title");
    expect(body.body).toBe("Body");
    expect(body.level).toBe("active");
    expect(body.group).toBe("AgentNotify");
    expect(body.icon).toBe("https://opencode.ai/apple-touch-icon.png");
  });

  it("returns failed result on non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 401 }));
    const provider = new BarkProvider("https://api.day.app/device-key", fetchMock);

    const result = await provider.send({
      title: "Title",
      body: "Body",
      urgency: "normal",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});
