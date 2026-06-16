// Claude Code hook adapter: forwards notification-worthy events to agent-notify server.
// Configure Claude Code command hooks to run this file with tsx.
// Required config: ~/.config/claude-code/agent-notify.json.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface AgentNotifyConfig {
  serverUrl: string;
  token: string;
  timeoutMs: number;
  completionMinSeconds?: number;
  debugLogPath?: string;
  statePath?: string;
  stateTtlHours?: number;
}

interface ClaudeCodeNotificationFilterOptions {
  completionMinSeconds?: number;
  statePath: string;
  stateTtlMs?: number;
  nowMs?: () => number;
}

interface SessionState {
  startedAtMs: number;
}

interface ClaudeCodeState {
  sessions: Record<string, SessionState>;
}

type FetchLike = typeof fetch;

const NOTIFY_EVENT_NAMES = new Set(["Notification", "StopFailure"]);
const DEFAULT_STATE_TTL_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getHookEventName(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;
}

function getSessionId(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.session_id === "string" && raw.session_id.trim()
    ? raw.session_id
    : undefined;
}

function defaultStatePath(): string {
  return join(homedir(), ".config", "claude-code", "agent-notify-state.json");
}

export function loadState(statePath: string): ClaudeCodeState {
  if (!existsSync(statePath)) return { sessions: {} };
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    if (!isRecord(raw) || !isRecord(raw.sessions)) return { sessions: {} };

    const sessions: Record<string, SessionState> = {};
    for (const [sessionId, value] of Object.entries(raw.sessions)) {
      if (!isRecord(value)) continue;
      if (typeof value.startedAtMs !== "number" || !Number.isFinite(value.startedAtMs)) {
        continue;
      }
      sessions[sessionId] = { startedAtMs: value.startedAtMs };
    }
    return { sessions };
  } catch {
    return { sessions: {} };
  }
}

export function saveState(statePath: string, state: ClaudeCodeState): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tempPath, statePath);
}

function pruneState(
  state: ClaudeCodeState,
  nowMs: number,
  stateTtlMs: number,
): ClaudeCodeState {
  const sessions: Record<string, SessionState> = {};
  for (const [sessionId, session] of Object.entries(state.sessions)) {
    if (nowMs - session.startedAtMs <= stateTtlMs) {
      sessions[sessionId] = session;
    }
  }
  return { sessions };
}

export function createClaudeCodeNotificationFilter(
  options: ClaudeCodeNotificationFilterOptions,
) {
  const completionMinSeconds = options.completionMinSeconds ?? 0;
  const nowMs = options.nowMs ?? Date.now;
  const stateTtlMs = options.stateTtlMs ?? DEFAULT_STATE_TTL_MS;

  function readPrunedState(): ClaudeCodeState {
    return pruneState(loadState(options.statePath), nowMs(), stateTtlMs);
  }

  function writeState(state: ClaudeCodeState): void {
    saveState(options.statePath, state);
  }

  function shouldNotifyCompletion(raw: unknown): boolean {
    const sessionId = getSessionId(raw);
    if (!sessionId || completionMinSeconds <= 0) return false;

    const state = readPrunedState();
    const session = state.sessions[sessionId];
    delete state.sessions[sessionId];
    writeState(state);

    if (!session) return false;
    const elapsedSeconds = (nowMs() - session.startedAtMs) / 1000;
    return elapsedSeconds >= completionMinSeconds;
  }

  return {
    shouldNotify(raw: unknown): boolean {
      const hookEventName = getHookEventName(raw);
      const sessionId = getSessionId(raw);

      if (hookEventName === "UserPromptSubmit") {
        const state = readPrunedState();
        if (sessionId) {
          state.sessions[sessionId] = { startedAtMs: nowMs() };
        }
        writeState(state);
        return false;
      }

      if (hookEventName === "Stop") {
        return shouldNotifyCompletion(raw);
      }

      if (hookEventName === "StopFailure") {
        const state = readPrunedState();
        if (sessionId) {
          delete state.sessions[sessionId];
        }
        writeState(state);
        return true;
      }

      return typeof hookEventName === "string" && NOTIFY_EVENT_NAMES.has(hookEventName);
    },
  };
}

export function summarizeClaudeCodeEventForDebug(raw: unknown): Record<string, unknown> {
  return {
    hookEventName: getHookEventName(raw) ?? "unknown",
    sessionId: getSessionId(raw),
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
        ...summarizeClaudeCodeEventForDebug(raw),
      })}\n`,
    );
  } catch {
    // Fail-safe: debug logging must never block Claude Code.
  }
}

export async function sendClaudeCodeEvent(
  serverUrl: string,
  token: string,
  timeoutMs: number,
  raw: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(`${serverUrl.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agent: "claude-code", raw }),
      signal: controller.signal,
    });
  } catch {
    // Fail-safe: never block Claude Code on agent-notify errors.
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
  const configPath = join(homedir(), ".config", "claude-code", "agent-notify.json");
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  return {
    serverUrl: readRequiredString(raw, "serverUrl"),
    token: readRequiredString(raw, "token"),
    timeoutMs: readRequiredNumber(raw, "timeoutMs"),
    completionMinSeconds: readOptionalNumber(raw, "completionMinSeconds"),
    debugLogPath: readOptionalString(raw, "debugLogPath"),
    statePath: readOptionalString(raw, "statePath"),
    stateTtlHours: readOptionalNumber(raw, "stateTtlHours"),
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function notify(
  config: AgentNotifyConfig,
  filter: ReturnType<typeof createClaudeCodeNotificationFilter>,
  raw: unknown,
) {
  const forwarded = filter.shouldNotify(raw);
  writeDebugLog(config, raw, forwarded);
  if (!forwarded) return;
  await sendClaudeCodeEvent(config.serverUrl, config.token, config.timeoutMs, raw);
}

async function main(): Promise<void> {
  let config: AgentNotifyConfig;
  try {
    config = readAgentNotifyConfig();
  } catch {
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readStdin());
  } catch {
    return;
  }

  const stateTtlMs = (config.stateTtlHours ?? 24) * 60 * 60 * 1000;
  const filter = createClaudeCodeNotificationFilter({
    completionMinSeconds: config.completionMinSeconds,
    statePath: config.statePath ?? defaultStatePath(),
    stateTtlMs,
  });

  try {
    await notify(config, filter, raw);
  } catch {
    // Fail-safe: never block Claude Code on adapter errors.
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
