// Codex hook adapter: forwards notification-worthy events to agent-notify server.
// Configure Codex command hooks to run this file with node.
// Required config: ~/.config/agent-notify/codex.json.

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NOTIFY_EVENT_NAMES = new Set([
  "UserPromptSubmit",
  "PermissionRequest",
  "Stop",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHookEventName(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.hook_event_name === "string"
    ? raw.hook_event_name
    : undefined;
}

function getSessionId(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.session_id === "string" && raw.session_id.trim()
    ? raw.session_id
    : undefined;
}

function getToolName(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.tool_name === "string" && raw.tool_name.trim()
    ? raw.tool_name
    : undefined;
}

function getPermissionMode(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.permission_mode === "string" && raw.permission_mode.trim()
    ? raw.permission_mode
    : undefined;
}

export function shouldForwardCodexEvent(raw) {
  const hookEventName = getHookEventName(raw);
  if (hookEventName === "PermissionRequest") {
    return getPermissionMode(raw) !== "bypassPermissions";
  }
  return typeof hookEventName === "string" && NOTIFY_EVENT_NAMES.has(hookEventName);
}

export function summarizeCodexEventForDebug(raw) {
  return {
    hookEventName: getHookEventName(raw) ?? "unknown",
    sessionId: getSessionId(raw),
    toolName: getToolName(raw),
    raw,
  };
}

function writeDebugLog(config, raw, forwarded, sent) {
  if (!config.debugLogPath) return;

  try {
    appendFileSync(
      config.debugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        forwarded,
        sent,
        ...summarizeCodexEventForDebug(raw),
      })}\n`,
    );
  } catch {
    // Fail-safe: debug logging must never block Codex.
  }
}

export async function sendCodexEvent(
  serverUrl,
  token,
  timeoutMs,
  raw,
  fetchImpl = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${serverUrl.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agent: "codex", raw }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readRequiredString(raw, key) {
  const value = raw[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`agent-notify config requires ${key}`);
  }
  return value;
}

function readOptionalNumber(raw, key) {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`agent-notify config ${key} must be a non-negative number`);
  }
  return value;
}

function readOptionalString(raw, key) {
  const value = raw[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`agent-notify config ${key} must be a non-empty string`);
  }
  return value;
}

const DEFAULT_TIMEOUT_MS = 2000;

export function parseCodexConfig(raw) {
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readOptionalNumber(raw, "timeoutMs") ?? DEFAULT_TIMEOUT_MS,
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
}

function readAgentNotifyConfig() {
  const configPath = join(homedir(), ".config", "agent-notify", "codex.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  return parseCodexConfig(raw);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let config;
  try {
    config = readAgentNotifyConfig();
  } catch {
    return;
  }

  let raw;
  try {
    raw = JSON.parse(await readStdin());
  } catch {
    return;
  }

  const forwarded = shouldForwardCodexEvent(raw);
  if (!forwarded) {
    writeDebugLog(config, raw, false, false);
    return;
  }

  const sent = await sendCodexEvent(
    config.serverUrl,
    config.token,
    config.timeoutMs,
    raw,
  );
  writeDebugLog(config, raw, true, sent);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
