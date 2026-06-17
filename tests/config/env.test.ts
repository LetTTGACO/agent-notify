import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("defaults Claude Code completion threshold to disabled", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
    });

    expect(config.claudeCompletionMinSeconds).toBe(0);
  });

  it("parses Claude Code completion threshold", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
      AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS: "120",
    });

    expect(config.claudeCompletionMinSeconds).toBe(120);
  });

  it("rejects negative Claude Code completion threshold", () => {
    expect(() =>
      parseConfig({
        AGENT_NOTIFY_TOKENS: "macbook:abc",
        BARK_ENDPOINT: "https://api.day.app/key",
        AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS: "-1",
      }),
    ).toThrow();
  });

  it("defaults Codex completion threshold to disabled", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
    });

    expect(config.codexCompletionMinSeconds).toBe(0);
  });

  it("parses Codex completion threshold", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      BARK_ENDPOINT: "https://api.day.app/key",
      AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS: "120",
    });

    expect(config.codexCompletionMinSeconds).toBe(120);
  });

  it("rejects negative Codex completion threshold", () => {
    expect(() =>
      parseConfig({
        AGENT_NOTIFY_TOKENS: "macbook:abc",
        BARK_ENDPOINT: "https://api.day.app/key",
        AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS: "-1",
      }),
    ).toThrow();
  });

  it("documents Codex completion threshold in the env example", () => {
    const contents = readFileSync(".env.example", "utf8");

    expect(contents).toContain("AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS=");
  });

  it("passes Codex completion threshold through Docker compose", () => {
    const contents = readFileSync("deploy/docker/docker-compose.yml", "utf8");

    expect(contents).toContain("AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS");
  });

  it("documents ntfy provider config in the env example", () => {
    const contents = readFileSync(".env.example", "utf8");

    expect(contents).toContain("NTFY_ENDPOINT=");
    expect(contents).toContain("NTFY_TOKEN=");
  });

  it("passes ntfy provider config through Docker compose", () => {
    const contents = readFileSync("deploy/docker/docker-compose.yml", "utf8");

    expect(contents).toContain("NTFY_ENDPOINT");
    expect(contents).toContain("NTFY_TOKEN");
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

  it("parses ntfy provider config", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      AGENT_NOTIFY_PROVIDER: "ntfy",
      NTFY_ENDPOINT: "https://ntfy.sh/agent_notify_xxx",
      NTFY_TOKEN: "tk_secret",
    });

    expect(config.provider).toBe("ntfy");
    expect(config.ntfyEndpoint).toBe("https://ntfy.sh/agent_notify_xxx");
    expect(config.ntfyToken).toBe("tk_secret");
  });

  it("does not require Bark endpoint for ntfy provider", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      AGENT_NOTIFY_PROVIDER: "ntfy",
      NTFY_ENDPOINT: "https://ntfy.sh/agent_notify_xxx",
    });

    expect(config.provider).toBe("ntfy");
    expect(config.ntfyEndpoint).toBe("https://ntfy.sh/agent_notify_xxx");
  });

  it("does not require ntfy endpoint for Bark provider", () => {
    const config = parseConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      AGENT_NOTIFY_PROVIDER: "bark",
      BARK_ENDPOINT: "https://api.day.app/key",
    });

    expect(config.provider).toBe("bark");
    expect(config.barkEndpoint).toBe("https://api.day.app/key");
  });

  it("rejects ntfy provider without ntfy endpoint", () => {
    expect(() =>
      parseConfig({
        AGENT_NOTIFY_TOKENS: "macbook:abc",
        AGENT_NOTIFY_PROVIDER: "ntfy",
      }),
    ).toThrow("NTFY_ENDPOINT is required when AGENT_NOTIFY_PROVIDER=ntfy");
  });

  it("rejects Bark provider without Bark endpoint", () => {
    expect(() =>
      parseConfig({
        AGENT_NOTIFY_TOKENS: "macbook:abc",
        AGENT_NOTIFY_PROVIDER: "bark",
      }),
    ).toThrow("BARK_ENDPOINT is required when AGENT_NOTIFY_PROVIDER=bark");
  });
});
