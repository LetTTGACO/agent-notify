import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AgentNotifyPlugin,
  addOpenCodeCwd,
  getOpenCodeMuteReason,
  getOpenCodeSessionId,
  notify,
  parseAgentNotifyCommand,
  parseAgentNotifyConfig,
  shouldNotify,
  summarizeOpenCodeEventForDebug,
} from "../../examples/opencode/agent-notify.js";

describe("OpenCode plugin example", () => {
  it("parses AgentNotify commands for OpenCode", () => {
    const now = new Date("2026-06-28T08:00:00.000Z");

    expect(parseAgentNotifyCommand("/agent-notify on", now)).toEqual({
      type: "on",
    });
    expect(parseAgentNotifyCommand("/agent-notify status", now)).toEqual({
      type: "status",
    });
    expect(parseAgentNotifyCommand("/agent-notify off", now)).toEqual({
      type: "off-session",
    });
    expect(parseAgentNotifyCommand("/agent-notify off persist", now)).toEqual({
      type: "off-persist",
    });
    expect(parseAgentNotifyCommand("/agent-notify off 1d", now)).toEqual({
      type: "off-until",
      until: "2026-06-29T08:00:00.000Z",
    });
  });

  it("extracts OpenCode session ids from top-level and properties fields", () => {
    expect(getOpenCodeSessionId({ sessionID: "top_session" })).toBe("top_session");
    expect(getOpenCodeSessionId({ sessionId: "camel_session" })).toBe(
      "camel_session",
    );
    expect(
      getOpenCodeSessionId({
        properties: { sessionID: "property_session" },
      }),
    ).toBe("property_session");
    expect(getOpenCodeSessionId({ properties: {} })).toBeUndefined();
  });

  it("defaults timeoutMs to 2000 when not configured", () => {
    const config = parseAgentNotifyConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
    });

    expect(config.timeoutMs).toBe(2_000);
  });

  it("uses the configured timeoutMs", () => {
    const config = parseAgentNotifyConfig({
      serverUrl: "http://127.0.0.1:8787",
      token: "secret",
      timeoutMs: 5_000,
    });

    expect(config.timeoutMs).toBe(5_000);
  });

  it("summarizes every event for plugin-side debug logs", () => {
    const raw = {
      type: "message.updated",
      sessionID: "session_1",
      properties: {
        sessionID: "session_2",
        messageID: "message_1",
      },
    };

    expect(
      summarizeOpenCodeEventForDebug(raw),
    ).toEqual({
      type: "message.updated",
      raw,
    });
  });

  it("forwards notification-worthy events and busy status, drops the rest", () => {
    expect(shouldNotify({ type: "permission.asked" })).toBe(true);
    expect(shouldNotify({ type: "permission.v2.asked" })).toBe(true);
    expect(shouldNotify({ type: "question.asked" })).toBe(true);
    expect(shouldNotify({ type: "session.error" })).toBe(true);
    expect(shouldNotify({ type: "session.idle" })).toBe(true);
    expect(
      shouldNotify({
        type: "session.status",
        properties: { status: { type: "busy" } },
      }),
    ).toBe(true);

    expect(shouldNotify({ type: "message.updated" })).toBe(false);
    expect(
      shouldNotify({
        type: "session.status",
        properties: { status: { type: "idle" } },
      }),
    ).toBe(false);
    expect(shouldNotify({ type: "session.status" })).toBe(false);
  });

  it("adds top-level cwd to OpenCode raw events before forwarding", () => {
    const raw = {
      id: "evt_project_1",
      type: "question.asked",
      properties: {
        sessionID: "session_project_1",
      },
    };

    expect(addOpenCodeCwd(raw, "/Users/1874w/@1874/agent-notify")).toEqual({
      ...raw,
      cwd: "/Users/1874w/@1874/agent-notify",
    });
  });

  it("does not override an existing string cwd on OpenCode raw events", () => {
    const raw = {
      id: "evt_project_2",
      type: "question.asked",
      cwd: "/tmp/existing-project",
      properties: {
        sessionID: "session_project_2",
      },
    };

    expect(addOpenCodeCwd(raw, "/Users/1874w/@1874/agent-notify")).toEqual(raw);
  });

  it("leaves non-object OpenCode raw values unchanged when adding cwd", () => {
    expect(addOpenCodeCwd("not-an-object", "/Users/1874w/project")).toBe(
      "not-an-object",
    );
  });

  it("does not send OpenCode events while the current session is muted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const readState = vi.fn().mockReturnValue({
      persistentDisabled: false,
      disabledSessions: {
        opencode_session_5: { disabledAt: "2026-06-28T08:00:00.000Z" },
      },
    });

    await expect(
      notify(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          type: "permission.asked",
          properties: { sessionID: "opencode_session_5" },
        },
        "/Users/1874w/@1874/agent-notify",
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath: "/tmp/agent-notify-opencode-muted.json",
          readState,
        },
      ),
    ).resolves.toEqual({ forwarded: true, sent: false, muted: "session" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("registers command.execute.before, mutes the current session, and clears output parts", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-opencode-plugin-"));
    const homeDir = join(tempDir, "home");
    const configDir = join(homeDir, ".config", "opencode");
    const xdgConfigDir = join(tempDir, "xdg");
    const stateDir = join(xdgConfigDir, "agent-notify", "state");
    const statePath = join(stateDir, "opencode.json");

    mkdirSync(configDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(configDir, "agent-notify.json"),
      JSON.stringify({
        serverUrl: "http://127.0.0.1:8787",
        token: "secret",
        timeoutMs: 2_000,
      }),
      "utf8",
    );

    const previousHome = process.env.HOME;
    const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.HOME = homeDir;
    process.env.XDG_CONFIG_HOME = xdgConfigDir;

    try {
      const plugin = await AgentNotifyPlugin({
        directory: "/Users/1874w/@1874/agent-notify",
      });

      expect(plugin).toHaveProperty("command.execute.before");
      expect(plugin).not.toHaveProperty("tui.command.execute");

      const output = {
        parts: [{ type: "text", text: "AgentNotify command: off" }],
      };

      await expect(
        plugin["command.execute.before"](
          {
            command: "agent-notify",
            arguments: "off",
            sessionID: "opencode_session_44",
          },
          output,
        ),
      ).resolves.toBeDefined();

      expect(output.parts).toEqual([]);
      expect(JSON.parse(readFileSync(statePath, "utf8"))).toMatchObject({
        persistentDisabled: false,
        disabledSessions: {
          opencode_session_44: {
            disabledAt: expect.any(String),
          },
        },
      });
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
      }
    }
  });

  it("forwards OpenCode events when the switch state file is malformed and surfaces debug info", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-opencode-bad-state-"));
    const statePath = join(tempDir, "opencode.json");
    writeFileSync(statePath, "{not-json", "utf8");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      notify(
        {
          serverUrl: "http://127.0.0.1:8787",
          token: "secret",
          timeoutMs: 2_000,
        },
        {
          type: "permission.asked",
          properties: { sessionID: "opencode_session_11" },
        },
        "/Users/1874w/@1874/agent-notify",
        {
          fetchImpl: fetchMock,
          now: new Date("2026-06-28T08:01:00.000Z"),
          statePath,
        },
      ),
    ).resolves.toEqual({
      forwarded: true,
      sent: true,
      debug: expect.objectContaining({
        switchStateReadError: expect.stringContaining("state-read"),
      }),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("writes switch state read errors into the configured debug log during command.execute.before", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "agent-notify-opencode-debug-"));
    const homeDir = join(tempDir, "home");
    const configDir = join(homeDir, ".config", "opencode");
    const xdgConfigDir = join(tempDir, "xdg");
    const stateDir = join(xdgConfigDir, "agent-notify", "state");
    const statePath = join(stateDir, "opencode.json");
    const debugLogPath = join(tempDir, "opencode-debug.log");

    mkdirSync(configDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(configDir, "agent-notify.json"),
      JSON.stringify({
        serverUrl: "http://127.0.0.1:8787",
        token: "secret",
        timeoutMs: 2_000,
        debugLogPath,
      }),
      "utf8",
    );
    writeFileSync(statePath, "{not-json", "utf8");

    const previousHome = process.env.HOME;
    const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.HOME = homeDir;
    process.env.XDG_CONFIG_HOME = xdgConfigDir;

    try {
      const plugin = await AgentNotifyPlugin({
        directory: "/Users/1874w/@1874/agent-notify",
      });

      const output = {
        parts: [{ type: "text", text: "AgentNotify command: status" }],
      };

      await plugin["command.execute.before"](
        {
          command: "agent-notify",
          arguments: "status",
          sessionId: "opencode_session_55",
        },
        output,
      );

      expect(JSON.parse(readFileSync(debugLogPath, "utf8").trim())).toMatchObject({
        switchStateReadError: expect.stringContaining("state-read"),
      });
      expect(output.parts).toEqual([]);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
      }
    }
  });
});
