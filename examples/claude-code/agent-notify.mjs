// Claude Code hook adapter: forwards notification-worthy events to agent-notify server.
// Configure Claude Code command hooks to run this file with node.
// Required config: ~/.config/claude-code/agent-notify.json.

import { appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NOTIFY_EVENT_NAMES = new Set([
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "StopFailure",
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

export function shouldForwardClaudeCodeEvent(raw) {
  const hookEventName = getHookEventName(raw);
  return typeof hookEventName === "string" && NOTIFY_EVENT_NAMES.has(hookEventName);
}

export function summarizeClaudeCodeEventForDebug(raw) {
  return {
    hookEventName: getHookEventName(raw) ?? "unknown",
    sessionId: getSessionId(raw),
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
        ...summarizeClaudeCodeEventForDebug(raw),
      })}\n`,
    );
  } catch {
    // Fail-safe: debug logging must never block Claude Code.
  }
}

export async function sendClaudeCodeEvent(
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
      body: JSON.stringify({ agent: "claude-code", raw }),
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

function readRequiredNumber(raw, key) {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`agent-notify config requires ${key}`);
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

function readAgentNotifyConfig() {
  const configPath = join(homedir(), ".config", "claude-code", "agent-notify.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readRequiredNumber(raw, "timeoutMs"),
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
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

  const forwarded = shouldForwardClaudeCodeEvent(raw);
  if (!forwarded) {
    writeDebugLog(config, raw, false, false);
    return;
  }

  const sent = await sendClaudeCodeEvent(
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
