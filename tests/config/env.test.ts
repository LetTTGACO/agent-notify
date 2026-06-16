import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(config.language).toBe("en");
    expect(config.logPath).toBe("./data/events.jsonl");
    expect(config.logRaw).toBe(false);
    expect("dedupeSeconds" in config).toBe(false);
  });

  it("parses notification language", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
      AGENT_NOTIFY_LANGUAGE: "zh",
    });

    expect(config.language).toBe("zh");
  });

  it("rejects unsupported notification languages", () => {
    expect(() =>
      parseConfig({
        AGENT_NOTIFY_TOKENS: "macbook:abc",
        BARK_ENDPOINT: "https://api.day.app/key",
        AGENT_NOTIFY_LANGUAGE: "fr",
      }),
    ).toThrow();
  });

  it("loads missing env vars from a .env file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "agent-notify-"));
    writeFileSync(join(tmp, ".env"), "AGENT_NOTIFY_TOKENS=macbook:abc\nBARK_ENDPOINT=https://api.day.app/key\n# comment\n\nEMPTY=\n");
    const prevCwd = process.cwd();
    const prevTokens = process.env.AGENT_NOTIFY_TOKENS;
    const prevBark = process.env.BARK_ENDPOINT;
    const prevEmpty = process.env.EMPTY;
    delete process.env.AGENT_NOTIFY_TOKENS;
    delete process.env.BARK_ENDPOINT;
    delete process.env.EMPTY;
    try {
      process.chdir(tmp);
      const config = parseConfig(process.env);
      expect(config.tokens).toEqual([{ name: "macbook", value: "abc" }]);
      expect(config.barkEndpoint).toBe("https://api.day.app/key");
    } finally {
      process.chdir(prevCwd);
      if (prevTokens !== undefined) process.env.AGENT_NOTIFY_TOKENS = prevTokens;
      if (prevBark !== undefined) process.env.BARK_ENDPOINT = prevBark;
      if (prevEmpty !== undefined) process.env.EMPTY = prevEmpty;
    }
  });

  it("does not overwrite existing process.env values when loading .env", () => {
    const tmp = mkdtempSync(join(tmpdir(), "agent-notify-"));
    writeFileSync(join(tmp, ".env"), "AGENT_NOTIFY_TOKENS=from-file\nBARK_ENDPOINT=https://api.day.app/file\n");
    const prevCwd = process.cwd();
    const prevTokens = process.env.AGENT_NOTIFY_TOKENS;
    const prevBark = process.env.BARK_ENDPOINT;
    process.env.AGENT_NOTIFY_TOKENS = "from-shell:abc";
    process.env.BARK_ENDPOINT = "https://api.day.app/shell";
    try {
      process.chdir(tmp);
      const config = parseConfig(process.env);
      expect(config.tokens[0].value).toBe("abc");
      expect(config.barkEndpoint).toBe("https://api.day.app/shell");
    } finally {
      process.chdir(prevCwd);
      if (prevTokens !== undefined) process.env.AGENT_NOTIFY_TOKENS = prevTokens;
      if (prevBark !== undefined) process.env.BARK_ENDPOINT = prevBark;
    }
  });
});
