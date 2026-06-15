import { describe, expect, it } from "vitest";
import { parseConfig, parseTokenList } from "../../src/config/env.js";

describe("config parsing", () => {
  it("parses named bearer tokens", () => {
    expect(parseTokenList("macbook:abc,ubuntu:def")).toEqual([
      { name: "macbook", value: "abc" },
      { name: "ubuntu", value: "def" },
    ]);
  });

  it("rejects malformed tokens", () => {
    expect(() => parseTokenList("missing-name")).toThrow("Invalid token entry");
  });

  it("parses env with defaults", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8787);
    expect(config.provider).toBe("bark");
    expect(config.logPath).toBe("./data/events.jsonl");
    expect(config.logRaw).toBe(false);
    expect(config.dedupeSeconds).toBe(30);
  });
});
