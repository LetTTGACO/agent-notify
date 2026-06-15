// OpenCode plugin: forwards events to agent-notify server.
// Copy this file to ~/.config/opencode/plugins/ or .opencode/plugins/.
// Required env: AGENT_NOTIFY_TOKEN. Optional: AGENT_NOTIFY_SERVER_URL, AGENT_NOTIFY_PROJECT, AGENT_NOTIFY_INCLUDE_RAW, AGENT_NOTIFY_TIMEOUT_MS.

interface AgentEvent {
  agent: "opencode";
  kind: "permission_required" | "completed" | "failed" | "attention";
  title: string;
  message?: string;
  project?: string;
  sessionId?: string;
  cwd?: string;
  sourceEvent: string;
  raw?: unknown;
}

function basename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1);
}

function isDeniedReply(payload: Record<string, unknown>): boolean {
  const text = JSON.stringify(payload).toLowerCase();
  return (
    text.includes("denied") ||
    text.includes("cancelled") ||
    text.includes("canceled") ||
    text.includes("error")
  );
}

function mapOpenCodeEvent(
  sourceEvent: string,
  payload: Record<string, unknown>,
  projectOverride?: string,
): AgentEvent | null {
  const cwd = String(payload.cwd ?? payload.path ?? "") || undefined;
  const project = projectOverride ?? basename(cwd);
  const sessionId =
    String(payload.sessionId ?? payload.sessionID ?? payload.session_id ?? "") ||
    undefined;
  const base = { agent: "opencode" as const, project, sessionId, cwd, sourceEvent };

  if (sourceEvent === "permission.asked") {
    return {
      ...base,
      kind: "permission_required",
      title: "OpenCode needs permission",
      message: "OpenCode is waiting for approval.",
      raw: payload,
    };
  }
  if (sourceEvent === "session.error") {
    return {
      ...base,
      kind: "failed",
      title: "OpenCode session error",
      message: String(payload.message ?? payload.error ?? "OpenCode reported an error."),
      raw: payload,
    };
  }
  if (sourceEvent === "session.idle") {
    return {
      ...base,
      kind: "attention",
      title: "OpenCode session idle",
      message: "OpenCode is idle and may need review.",
      raw: payload,
    };
  }
  if (sourceEvent === "permission.replied" && isDeniedReply(payload)) {
    return {
      ...base,
      kind: "attention",
      title: "OpenCode permission was not approved",
      message: "A permission request was denied, cancelled, or failed.",
      raw: payload,
    };
  }
  return null;
}

async function sendOpenCodeEvent(
  serverUrl: string,
  token: string,
  timeoutMs: number,
  event: AgentEvent,
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
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } catch {
    // Fail-safe: never block OpenCode on agent-notify errors.
  } finally {
    clearTimeout(timer);
  }
}

const SERVER_URL = process.env.AGENT_NOTIFY_SERVER_URL ?? "http://127.0.0.1:8787";
const TOKEN = process.env.AGENT_NOTIFY_TOKEN ?? "";
const PROJECT = process.env.AGENT_NOTIFY_PROJECT;
const INCLUDE_RAW = process.env.AGENT_NOTIFY_INCLUDE_RAW === "true";
const TIMEOUT_MS = Number(process.env.AGENT_NOTIFY_TIMEOUT_MS ?? 2000);

async function notify(sourceEvent: string, payload: Record<string, unknown>) {
  if (!TOKEN) return;
  const event = mapOpenCodeEvent(sourceEvent, payload, PROJECT);
  if (!event) return;
  const safeEvent = INCLUDE_RAW ? event : { ...event, raw: undefined };
  await sendOpenCodeEvent(SERVER_URL, TOKEN, TIMEOUT_MS, safeEvent);
}

// OpenCode plugin: export a function that returns a hooks object.
// See https://opencode.ai/docs/plugins/ for the real plugin API.
export const AgentNotifyPlugin = async () => {
  return {
    "permission.asked": async (input: { properties?: Record<string, unknown> }) =>
      notify("permission.asked", input.properties ?? {}),
    "session.error": async (input: { properties?: Record<string, unknown> }) =>
      notify("session.error", input.properties ?? {}),
    "session.idle": async (input: { properties?: Record<string, unknown> }) =>
      notify("session.idle", input.properties ?? {}),
    "permission.replied": async (input: { properties?: Record<string, unknown> }) =>
      notify("permission.replied", input.properties ?? {}),
  };
};

export default AgentNotifyPlugin;
