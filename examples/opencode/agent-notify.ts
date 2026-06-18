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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEventType(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.type === "string" ? raw.type : undefined;
}

function getProperties(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  return isRecord(raw.properties) ? raw.properties : raw;
}

function getSessionID(raw: unknown): string | undefined {
  const properties = getProperties(raw);
  return typeof properties.sessionID === "string" && properties.sessionID.trim()
    ? properties.sessionID
    : undefined;
}

function getStatusType(raw: unknown): string | undefined {
  const status = getProperties(raw).status;
  if (!isRecord(status)) return undefined;
  return typeof status.type === "string" ? status.type : undefined;
}

const FORWARD_EVENT_TYPES = new Set([
  "permission.v2.asked",
  "permission.asked",
  "question.asked",
  "session.error",
  "session.idle",
]);

export function shouldNotify(raw: unknown): boolean {
  const type = getEventType(raw);
  if (typeof type !== "string") return false;
  if (FORWARD_EVENT_TYPES.has(type)) return true;
  return type === "session.status" && getStatusType(raw) === "busy";
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

function readOptionalNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`agent-notify config ${key} must be a non-negative number`);
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

const DEFAULT_TIMEOUT_MS = 2000;

export function parseAgentNotifyConfig(raw: Record<string, unknown>): AgentNotifyConfig {
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readOptionalNumber(raw, "timeoutMs") ?? DEFAULT_TIMEOUT_MS,
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
}

function readAgentNotifyConfig(): AgentNotifyConfig {
  const configPath = join(homedir(), ".config", "opencode", "agent-notify.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  return parseAgentNotifyConfig(raw);
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
