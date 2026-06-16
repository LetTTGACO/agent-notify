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
  completionMinSeconds?: number;
  debugLogPath?: string;
}

const NOTIFY_EVENT_TYPES = new Set([
  "permission.v2.asked",
  "permission.asked",
  "question.asked",
  "session.error",
]);

interface OpenCodeNotificationFilterOptions {
  completionMinSeconds?: number;
  nowMs?: () => number;
}

interface SessionState {
  startedAtMs: number;
  failed: boolean;
  completed: boolean;
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

function immediateShouldNotify(raw: unknown): boolean {
  const type = getEventType(raw);
  return typeof type === "string" && NOTIFY_EVENT_TYPES.has(type);
}

export function createOpenCodeNotificationFilter(
  options: OpenCodeNotificationFilterOptions = {},
) {
  const completionMinSeconds = options.completionMinSeconds ?? 0;
  const nowMs = options.nowMs ?? Date.now;
  const sessions = new Map<string, SessionState>();

  function shouldNotifyCompletion(raw: unknown): boolean {
    if (completionMinSeconds <= 0) return false;

    const sessionID = getSessionID(raw);
    if (!sessionID) return false;

    const state = sessions.get(sessionID);
    if (!state || state.failed || state.completed) return false;

    const elapsedSeconds = (nowMs() - state.startedAtMs) / 1000;
    state.completed = true;
    if (elapsedSeconds < completionMinSeconds) return false;

    return true;
  }

  return {
    shouldNotify(raw: unknown): boolean {
      const type = getEventType(raw);
      const sessionID = getSessionID(raw);

      if (type === "session.status" && sessionID && getStatusType(raw) === "busy") {
        sessions.set(sessionID, {
          startedAtMs: nowMs(),
          failed: false,
          completed: false,
        });
        return false;
      }

      if (type === "session.error" && sessionID) {
        const state = sessions.get(sessionID);
        if (state) {
          state.failed = true;
        }
      }

      if (type === "session.idle") {
        return shouldNotifyCompletion(raw);
      }

      return immediateShouldNotify(raw);
    },
  };
}

export function shouldNotify(raw: unknown): boolean {
  return immediateShouldNotify(raw);
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

function readAgentNotifyConfig(): AgentNotifyConfig {
  const configPath = join(homedir(), ".config", "opencode", "agent-notify.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readRequiredNumber(raw, "timeoutMs"),
    completionMinSeconds: readOptionalNumber(raw, "completionMinSeconds"),
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
}

async function notify(
  config: AgentNotifyConfig,
  filter: ReturnType<typeof createOpenCodeNotificationFilter>,
  raw: unknown,
) {
  const forwarded = filter.shouldNotify(raw);
  writeDebugLog(config, raw, forwarded);
  if (!forwarded) return;
  await sendOpenCodeEvent(config.serverUrl, config.token, config.timeoutMs, raw);
}

// OpenCode plugin: use the unified `event` hook so we receive the real event
// object, including v1 and v2 permission event shapes.
// See https://opencode.ai/docs/plugins/ for the plugin API.
export const AgentNotifyPlugin = async () => {
  const config = readAgentNotifyConfig();
  const filter = createOpenCodeNotificationFilter({
    completionMinSeconds: config.completionMinSeconds,
  });

  return {
    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      await notify(config, filter, event);
    },
  };
};

export default AgentNotifyPlugin;
