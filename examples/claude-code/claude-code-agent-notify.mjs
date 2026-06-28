// Claude Code hook adapter: forwards notification-worthy events to agent-notify server.
// Configure Claude Code command hooks to run this file with node.
// Required config: ~/.config/agent-notify/claude-code.json.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

function getNotificationType(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.notification_type === "string" && raw.notification_type.trim()
    ? raw.notification_type
    : undefined;
}

export function shouldForwardClaudeCodeEvent(raw) {
  const hookEventName = getHookEventName(raw);
  if (hookEventName === "Notification" && getNotificationType(raw) === "idle_prompt") {
    return false;
  }
  return typeof hookEventName === "string" && NOTIFY_EVENT_NAMES.has(hookEventName);
}

export function summarizeClaudeCodeEventForDebug(raw) {
  return {
    hookEventName: getHookEventName(raw) ?? "unknown",
    sessionId: getSessionId(raw),
    raw,
  };
}

function writeDebugLog(config, raw, forwarded, sent, extra = {}) {
  if (!config.debugLogPath) return;

  try {
    appendFileSync(
      config.debugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        forwarded,
        sent,
        ...extra,
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
const DURATION_RE = /^(\d+)([smhd])$/;
const MAX_DISABLED_SESSIONS = 5;

function emptySwitchState() {
  return {
    persistentDisabled: false,
    disabledSessions: {},
  };
}

function withSwitchStateReadError(message) {
  return {
    ...emptySwitchState(),
    readError: `state-read: ${message}`,
  };
}

function readDisabledSessions(value) {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error("invalid disabledSessions");
  }

  const disabledSessions = {};
  for (const [sessionId, sessionState] of Object.entries(value)) {
    if (!isRecord(sessionState) || typeof sessionState.disabledAt !== "string") {
      throw new Error(`invalid disabledSessions.${sessionId}`);
    }
    disabledSessions[sessionId] = { disabledAt: sessionState.disabledAt };
  }
  return disabledSessions;
}

function trimDisabledSessions(disabledSessions) {
  return Object.fromEntries(
    Object.entries(disabledSessions)
      .sort(([, left], [, right]) => {
        const leftMs = Date.parse(left.disabledAt);
        const rightMs = Date.parse(right.disabledAt);
        return (
          (Number.isFinite(rightMs) ? rightMs : 0) -
          (Number.isFinite(leftMs) ? leftMs : 0)
        );
      })
      .slice(0, MAX_DISABLED_SESSIONS),
  );
}

function readOptionalBoolean(value, key) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`invalid ${key}`);
  }
  return value;
}

function readOptionalStateString(value, key) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`invalid ${key}`);
  }
  return value;
}

function addDuration(now, amount, unit) {
  const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(now.getTime() + amount * multipliers[unit]);
}

export function parseAgentNotifyCommand(prompt, now = new Date()) {
  if (typeof prompt !== "string") return { type: "none" };
  const trimmed = prompt.trim();
  const parts = trimmed.split(/\s+/);
  if (parts[0] !== "/agent-notify") return { type: "none" };
  const action = parts[1] ?? "status";
  const arg = parts[2];
  if (parts.length > 3) {
    return { type: "invalid", message: "Usage: /agent-notify on|off|status" };
  }
  if (action === "on" && !arg) return { type: "on" };
  if (action === "status" && !arg) return { type: "status" };
  if (action !== "off") {
    return { type: "invalid", message: "Usage: /agent-notify on|off|status" };
  }
  if (!arg) return { type: "off-session" };
  if (arg === "persist") return { type: "off-persist" };
  const match = arg.match(DURATION_RE);
  if (!match) {
    return {
      type: "invalid",
      message: "Use a duration like 30m, 2h, or persist",
    };
  }
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { type: "invalid", message: "Duration must be positive" };
  }
  return {
    type: "off-until",
    until: addDuration(now, amount, match[2]).toISOString(),
  };
}

export function getClaudeCodeSwitchStatePath(home = homedir()) {
  return join(home, ".config", "agent-notify", "state", "claude-code.json");
}

export function readClaudeCodeSwitchState(statePath) {
  try {
    if (!existsSync(statePath)) return emptySwitchState();
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    if (!isRecord(raw)) {
      throw new Error("invalid state root");
    }
    return {
      persistentDisabled:
        readOptionalBoolean(raw.persistentDisabled, "persistentDisabled") ?? false,
      temporaryDisabledUntil: readOptionalStateString(
        raw.temporaryDisabledUntil,
        "temporaryDisabledUntil",
      ),
      disabledSessions: readDisabledSessions(raw.disabledSessions),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return withSwitchStateReadError(message);
  }
}

export function writeClaudeCodeSwitchState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function applyClaudeCodeSwitchCommand(
  state,
  command,
  sessionId,
  now = new Date(),
) {
  const next = {
    persistentDisabled: state.persistentDisabled === true,
    temporaryDisabledUntil: state.temporaryDisabledUntil,
    disabledSessions: isRecord(state.disabledSessions)
      ? { ...state.disabledSessions }
      : {},
  };

  if (command.type === "on") {
    next.persistentDisabled = false;
    delete next.temporaryDisabledUntil;
    if (sessionId) delete next.disabledSessions[sessionId];
    return { state: next, message: "AgentNotify is on for Claude Code." };
  }

  if (command.type === "off-persist") {
    next.persistentDisabled = true;
    return {
      state: next,
      message: "AgentNotify is persistently muted for Claude Code.",
    };
  }

  if (command.type === "off-until") {
    next.temporaryDisabledUntil = command.until;
    return {
      state: next,
      message: `AgentNotify is muted for Claude Code until ${command.until}.`,
    };
  }

  if (command.type === "off-session") {
    if (!sessionId) {
      return {
        state: next,
        message:
          "Session mute requires a session id. Use /agent-notify off 30m or /agent-notify off persist.",
      };
    }
    next.disabledSessions[sessionId] = { disabledAt: now.toISOString() };
    next.disabledSessions = trimDisabledSessions(next.disabledSessions);
    return {
      state: next,
      message: "AgentNotify is muted for this Claude Code session.",
    };
  }

  return { state: next, message: command.message ?? "Invalid AgentNotify command." };
}

export function getClaudeCodeMuteReason(state, sessionId, now = new Date()) {
  if (state.persistentDisabled === true) return "persistent";
  if (typeof state.temporaryDisabledUntil === "string") {
    const untilMs = Date.parse(state.temporaryDisabledUntil);
    if (Number.isFinite(untilMs) && untilMs > now.getTime()) return "timed";
  }
  if (sessionId && isRecord(state.disabledSessions) && state.disabledSessions[sessionId]) {
    return "session";
  }
  return undefined;
}

function getClaudeCodeStatusMessage(state, sessionId, now = new Date()) {
  const muted = getClaudeCodeMuteReason(state, sessionId, now);
  if (muted === "persistent") {
    return "AgentNotify is persistently muted for Claude Code.";
  }
  if (muted === "timed") {
    return `AgentNotify is muted for Claude Code until ${state.temporaryDisabledUntil}.`;
  }
  if (muted === "session") {
    return "AgentNotify is muted for this Claude Code session.";
  }
  return "AgentNotify is on for Claude Code.";
}

export function parseClaudeCodeConfig(raw) {
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readOptionalNumber(raw, "timeoutMs") ?? DEFAULT_TIMEOUT_MS,
    debugLogPath: readOptionalString(raw, "debugLogPath"),
  };
}

function readAgentNotifyConfig() {
  const configPath = join(homedir(), ".config", "agent-notify", "claude-code.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8"));
  return parseClaudeCodeConfig(raw);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getPrompt(raw) {
  if (!isRecord(raw)) return undefined;
  return typeof raw.prompt === "string" ? raw.prompt : undefined;
}

export async function handleClaudeCodeEvent(config, raw, deps = {}) {
  const now = deps.now ?? new Date();
  const statePath = deps.statePath ?? getClaudeCodeSwitchStatePath();
  const readState = deps.readState ?? readClaudeCodeSwitchState;
  const writeState = deps.writeState ?? writeClaudeCodeSwitchState;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sessionId = getSessionId(raw);
  let state;
  let debug;
  try {
    state = readState(statePath);
    if (typeof state?.readError === "string") {
      debug = { switchStateReadError: state.readError };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = emptySwitchState();
    debug = { switchStateReadError: `state-read: ${message}` };
  }
  const command = parseAgentNotifyCommand(getPrompt(raw), now);

  if (getHookEventName(raw) === "UserPromptSubmit" && command.type !== "none") {
    if (command.type === "status") {
      return {
        forwarded: false,
        sent: false,
        command: command.type,
        message: getClaudeCodeStatusMessage(state, sessionId, now),
        ...(debug ? { debug } : {}),
      };
    }
    const result = applyClaudeCodeSwitchCommand(state, command, sessionId, now);
    if (command.type !== "invalid") {
      try {
        writeState(statePath, result.state);
      } catch {
        return {
          forwarded: false,
          sent: false,
          command: command.type,
          error: "state-write",
          ...(debug ? { debug } : {}),
        };
      }
    }
    return {
      forwarded: false,
      sent: false,
      command: command.type,
      message: result.message,
      ...(debug ? { debug } : {}),
    };
  }

  const forwarded = shouldForwardClaudeCodeEvent(raw);
  if (!forwarded) return { forwarded: false, sent: false };

  const muted = getClaudeCodeMuteReason(state, sessionId, now);
  if (muted) {
    return { forwarded: true, sent: false, muted, ...(debug ? { debug } : {}) };
  }

  const sent = await sendClaudeCodeEvent(
    config.serverUrl,
    config.token,
    config.timeoutMs,
    raw,
    fetchImpl,
  );
  return { forwarded: true, sent, ...(debug ? { debug } : {}) };
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

  const result = await handleClaudeCodeEvent(config, raw);
  writeDebugLog(config, raw, result.forwarded, result.sent, result.debug);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
