// OpenCode plugin: forwards notification-worthy events to agent-notify server.
// Copy this file to ~/.config/opencode/plugins/ or .opencode/plugins/.
// Required config: ~/.config/opencode/agent-notify.json.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface AgentNotifyConfig {
  serverUrl: string;
  token: string;
  timeoutMs: number;
  debugLogPath?: string;
}

type AgentNotifyCommand =
  | { type: "none" }
  | { type: "on" }
  | { type: "status" }
  | { type: "off-session" }
  | { type: "off-persist" }
  | { type: "off-until"; until: string }
  | { type: "invalid"; message: string };

interface AgentNotifySwitchState {
  persistentDisabled: boolean;
  temporaryDisabledUntil?: string;
  disabledSessions: Record<string, { disabledAt: string }>;
  readError?: string;
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

const DURATION_RE = /^(\d+)([smhd])$/;

function emptySwitchState(): AgentNotifySwitchState {
  return { persistentDisabled: false, disabledSessions: {} };
}

function withSwitchStateReadError(message: string): AgentNotifySwitchState {
  return {
    ...emptySwitchState(),
    readError: `state-read: ${message}`,
  };
}

function readDisabledSessions(
  value: unknown,
): Record<string, { disabledAt: string }> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error("invalid disabledSessions");
  }

  const disabledSessions: Record<string, { disabledAt: string }> = {};
  for (const [sessionId, sessionState] of Object.entries(value)) {
    if (!isRecord(sessionState) || typeof sessionState.disabledAt !== "string") {
      throw new Error(`invalid disabledSessions.${sessionId}`);
    }
    disabledSessions[sessionId] = { disabledAt: sessionState.disabledAt };
  }
  return disabledSessions;
}

function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`invalid ${key}`);
  }
  return value;
}

function readOptionalStateString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`invalid ${key}`);
  }
  return value;
}

function addDuration(now: Date, amount: number, unit: string): Date {
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return new Date(now.getTime() + amount * multipliers[unit]);
}

export function parseAgentNotifyCommand(
  prompt: string,
  now = new Date(),
): AgentNotifyCommand {
  const parts = prompt.trim().split(/\s+/);
  if (parts[0] !== "/agent-notify") return { type: "none" };
  const action = parts[1] ?? "status";
  const arg = parts[2];
  if (parts.length > 3) return { type: "invalid", message: "Usage: /agent-notify on|off|status" };
  if (action === "on" && !arg) return { type: "on" };
  if (action === "status" && !arg) return { type: "status" };
  if (action !== "off") return { type: "invalid", message: "Usage: /agent-notify on|off|status" };
  if (!arg) return { type: "off-session" };
  if (arg === "persist") return { type: "off-persist" };
  const match = arg.match(DURATION_RE);
  if (!match) return { type: "invalid", message: "Use a duration like 30m, 2h, or persist" };
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { type: "invalid", message: "Duration must be positive" };
  }
  return { type: "off-until", until: addDuration(now, amount, match[2]).toISOString() };
}

export function getOpenCodeSwitchStatePath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(configHome, "agent-notify", "state", "opencode.json");
}

export function getOpenCodeSessionId(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  const topLevel = raw.sessionID ?? raw.sessionId;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel;
  const properties = getProperties(raw);
  const propertySession = properties.sessionID ?? properties.sessionId;
  return typeof propertySession === "string" && propertySession.trim()
    ? propertySession
    : undefined;
}

export function addOpenCodeCwd(raw: unknown, directory: string): unknown {
  if (!isRecord(raw)) return raw;
  if (typeof raw.cwd === "string" && raw.cwd.trim()) return raw;
  return { ...raw, cwd: directory };
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
  sent: boolean,
  extra: Record<string, unknown> = {},
): void {
  if (!config.debugLogPath) return;

  try {
    appendFileSync(
      config.debugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        forwarded,
        sent,
        ...summarizeOpenCodeEventForDebug(raw),
        ...extra,
      })}\n`,
    );
  } catch {
    // Fail-safe: debug logging must never block OpenCode.
  }
}

export function readOpenCodeSwitchState(
  statePath: string,
): AgentNotifySwitchState {
  try {
    if (!existsSync(statePath)) return emptySwitchState();
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    if (!isRecord(raw)) {
      throw new Error("invalid state root");
    }
    return {
      persistentDisabled: readOptionalBoolean(raw.persistentDisabled, "persistentDisabled") ?? false,
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

export function writeOpenCodeSwitchState(
  statePath: string,
  state: AgentNotifySwitchState,
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function applyOpenCodeSwitchCommand(
  state: AgentNotifySwitchState,
  command: AgentNotifyCommand,
  sessionId: string | undefined,
  now = new Date(),
): { state: AgentNotifySwitchState; message: string } {
  const next: AgentNotifySwitchState = {
    persistentDisabled: state.persistentDisabled === true,
    temporaryDisabledUntil: state.temporaryDisabledUntil,
    disabledSessions: { ...state.disabledSessions },
  };
  if (command.type === "on") {
    next.persistentDisabled = false;
    delete next.temporaryDisabledUntil;
    if (sessionId) delete next.disabledSessions[sessionId];
    return { state: next, message: "AgentNotify is on for OpenCode." };
  }
  if (command.type === "off-persist") {
    next.persistentDisabled = true;
    return { state: next, message: "AgentNotify is persistently muted for OpenCode." };
  }
  if (command.type === "off-until") {
    next.temporaryDisabledUntil = command.until;
    return { state: next, message: `AgentNotify is muted for OpenCode until ${command.until}.` };
  }
  if (command.type === "off-session") {
    if (!sessionId) {
      return {
        state: next,
        message: "Session mute requires a session id. Use /agent-notify off 30m or /agent-notify off persist.",
      };
    }
    next.disabledSessions[sessionId] = { disabledAt: now.toISOString() };
    return { state: next, message: "AgentNotify is muted for this OpenCode session." };
  }
  return { state: next, message: command.type === "invalid" ? command.message : "AgentNotify is on for OpenCode." };
}

export function getOpenCodeMuteReason(
  state: AgentNotifySwitchState,
  sessionId: string | undefined,
  now = new Date(),
): "persistent" | "timed" | "session" | undefined {
  if (state.persistentDisabled === true) return "persistent";
  if (typeof state.temporaryDisabledUntil === "string") {
    const untilMs = Date.parse(state.temporaryDisabledUntil);
    if (Number.isFinite(untilMs) && untilMs > now.getTime()) return "timed";
  }
  if (sessionId && state.disabledSessions[sessionId]) return "session";
  return undefined;
}

function getOpenCodeStatusMessage(
  state: AgentNotifySwitchState,
  sessionId: string | undefined,
  now = new Date(),
): string {
  const muted = getOpenCodeMuteReason(state, sessionId, now);
  if (muted === "persistent") {
    return "AgentNotify is persistently muted for OpenCode.";
  }
  if (muted === "timed") {
    return `AgentNotify is muted for OpenCode until ${state.temporaryDisabledUntil}.`;
  }
  if (muted === "session") {
    return "AgentNotify is muted for this OpenCode session.";
  }
  return "AgentNotify is on for OpenCode.";
}

function getOpenCodeCommandName(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.command === "string" ? raw.command : undefined;
}

function getOpenCodeCommandArguments(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.arguments === "string") return raw.arguments;
  if (Array.isArray(raw.arguments)) {
    return raw.arguments.filter((value): value is string => typeof value === "string").join(" ");
  }
  return undefined;
}

async function sendOpenCodeEvent(
  serverUrl: string,
  token: string,
  timeoutMs: number,
  raw: unknown,
  fetchImpl = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${serverUrl.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agent: "opencode", raw }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
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

async function handleOpenCodeCommand(
  config: AgentNotifyConfig,
  input: {
    command?: string;
    arguments?: string | string[];
    sessionID?: string;
    sessionId?: string;
    properties?: Record<string, unknown>;
  },
  output?: { parts?: unknown[] },
): Promise<{ message: string } | undefined> {
  if (getOpenCodeCommandName(input) !== "agent-notify") return undefined;

  const now = new Date();
  const command = parseAgentNotifyCommand(
    `/agent-notify ${getOpenCodeCommandArguments(input) ?? ""}`.trim(),
    now,
  );
  const statePath = getOpenCodeSwitchStatePath();
  let state: AgentNotifySwitchState;
  let debug: { switchStateReadError: string } | undefined;
  try {
    state = readOpenCodeSwitchState(statePath);
    if (typeof state.readError === "string") {
      debug = { switchStateReadError: state.readError };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = emptySwitchState();
    debug = { switchStateReadError: `state-read: ${message}` };
  }

  const sessionId = getOpenCodeSessionId(input);
  const result =
    command.type === "status"
      ? {
          state,
          message: getOpenCodeStatusMessage(state, sessionId, now),
        }
      : applyOpenCodeSwitchCommand(state, command, sessionId, now);

  if (command.type !== "status" && command.type !== "invalid") {
    writeOpenCodeSwitchState(statePath, result.state);
  }
  if (debug) {
    writeDebugLog(config, input, false, false, debug);
  }
  if (output) {
    output.parts = [];
  }
  return { message: result.message };
}

export async function notify(
  config: AgentNotifyConfig,
  raw: unknown,
  directory: string,
  deps: {
    fetchImpl?: typeof fetch;
    now?: Date;
    statePath?: string;
    readState?: typeof readOpenCodeSwitchState;
  } = {},
): Promise<{ forwarded: boolean; sent: boolean; muted?: string }> {
  const rawWithCwd = addOpenCodeCwd(raw, directory);
  const forwarded = shouldNotify(rawWithCwd);
  if (!forwarded) {
    writeDebugLog(config, rawWithCwd, false, false);
    return { forwarded: false, sent: false };
  }

  const now = deps.now ?? new Date();
  const statePath = deps.statePath ?? getOpenCodeSwitchStatePath();
  const readState = deps.readState ?? readOpenCodeSwitchState;
  let state: AgentNotifySwitchState;
  let debug: { switchStateReadError: string } | undefined;
  try {
    state = readState(statePath);
    if (typeof state.readError === "string") {
      debug = { switchStateReadError: state.readError };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state = emptySwitchState();
    debug = { switchStateReadError: `state-read: ${message}` };
  }
  const muted = getOpenCodeMuteReason(state, getOpenCodeSessionId(rawWithCwd), now);
  if (muted) {
    writeDebugLog(config, rawWithCwd, true, false, debug);
    return { forwarded: true, sent: false, muted, ...(debug ? { debug } : {}) };
  }

  const sent = await sendOpenCodeEvent(
    config.serverUrl,
    config.token,
    config.timeoutMs,
    rawWithCwd,
    deps.fetchImpl ?? fetch,
  );
  writeDebugLog(config, rawWithCwd, forwarded, sent, debug);
  return { forwarded, sent, ...(debug ? { debug } : {}) };
}

// OpenCode plugin: use the unified `event` hook so we receive the real event
// object, including v1 and v2 permission event shapes.
// See https://opencode.ai/docs/plugins/ for the plugin API.
export const AgentNotifyPlugin = async ({
  directory,
}: {
  directory: string;
}) => {
  const config = readAgentNotifyConfig();

  return {
    config: async (opencodeConfig: { command?: Record<string, unknown> }) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command["agent-notify"] = {
        description: "Switch AgentNotify notifications on, off, timed, or status",
        template: "AgentNotify command: $ARGUMENTS",
      };
    },
    "command.execute.before": async (
      input: {
        command?: string;
        arguments?: string | string[];
        sessionID?: string;
        sessionId?: string;
        properties?: Record<string, unknown>;
      },
      output: { parts: unknown[] },
    ) => {
      return handleOpenCodeCommand(config, input, output);
    },
    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      await notify(config, event, directory);
    },
  };
};

export default AgentNotifyPlugin;
