// OpenCode plugin: forwards notification-worthy events to agent-notify server.
// Copy this file to ~/.config/opencode/plugins/ or .opencode/plugins/.
// Required config: ~/.config/opencode/agent-notify.json.

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface AgentNotifyConfig {
  serverUrl: string;
  token: string;
  timeoutMs: number;
  debugLogPath?: string;
}

const NOTIFY_EVENT_TYPES = new Set([
  "permission.v2.asked",
  "permission.asked",
  "question.asked",
  "session.error",
]);

export function shouldNotify(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }
  const type = (raw as { type?: unknown }).type;
  return typeof type === "string" && NOTIFY_EVENT_TYPES.has(type);
}

export function summarizeOpenCodeEventForDebug(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { type: "unknown" };
  }

  const event = raw as Record<string, unknown>;
  return {
    type: typeof event.type === "string" ? event.type : "unknown",
    raw,
  };
}

function writeDebugLog(
  config: AgentNotifyConfig,
  raw: unknown,
  forwarded: boolean,
): void {
  if (!config.debugLogPath) return;

  try {
    appendFileSync(
      config.debugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        forwarded,
        ...summarizeOpenCodeEventForDebug(raw),
      })}\n`,
    );
  } catch {
    // Fail-safe: debug logging must never block OpenCode.
  }
}

async function sendOpenCodeEvent(
  serverUrl: string,
  token: string,
  timeoutMs: number,
  raw: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${serverUrl.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agent: "opencode", raw }),
      signal: controller.signal,
    });
  } catch {
    // Fail-safe: never block OpenCode on agent-notify errors.
  } finally {
    clearTimeout(timer);
  }
}

function readRequiredString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`agent-notify config requires ${key}`);
  }
  return value;
}

function readRequiredNumber(raw: Record<string, unknown>, key: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`agent-notify config requires ${key}`);
  }
  return value;
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`agent-notify config ${key} must be a non-empty string`);
  }
  return value;
}

function readAgentNotifyConfig(): AgentNotifyConfig {
  const configPath = join(homedir(), ".config", "opencode", "agent-notify.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readRequiredNumber(raw, "timeoutMs"),
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
}

async function notify(config: AgentNotifyConfig, raw: unknown) {
  const forwarded = shouldNotify(raw);
  writeDebugLog(config, raw, forwarded);
  if (!forwarded) return;
  await sendOpenCodeEvent(config.serverUrl, config.token, config.timeoutMs, raw);
}

// OpenCode plugin: use the unified `event` hook so we receive the real event
// object, including v1 and v2 permission event shapes.
// See https://opencode.ai/docs/plugins/ for the plugin API.
export const AgentNotifyPlugin = async () => {
  const config = readAgentNotifyConfig();
  return {
    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      await notify(config, event);
    },
  };
};

export default AgentNotifyPlugin;
