import type { AgentEvent } from "../../core/events.js";

function basename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1);
}

function getSessionId(payload: Record<string, unknown>): string | undefined {
  return String(payload.sessionId ?? payload.sessionID ?? payload.session_id ?? "") || undefined;
}

function getCwd(payload: Record<string, unknown>): string | undefined {
  return String(payload.cwd ?? payload.path ?? "") || undefined;
}

function isDeniedReply(payload: Record<string, unknown>): boolean {
  const text = JSON.stringify(payload).toLowerCase();
  return text.includes("denied") || text.includes("cancelled") || text.includes("canceled") || text.includes("error");
}

export function mapOpenCodeEvent(
  sourceEvent: string,
  payload: Record<string, unknown>,
  projectOverride?: string,
): AgentEvent | null {
  const cwd = getCwd(payload);
  const project = projectOverride ?? basename(cwd);
  const base = {
    agent: "opencode" as const,
    project,
    sessionId: getSessionId(payload),
    cwd,
    sourceEvent,
  };

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

export async function sendOpenCodeEvent(
  config: { serverUrl: string; token: string; timeoutMs: number },
  event: AgentEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.serverUrl.replace(/\/$/, "")}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    return response.ok
      ? { ok: true }
      : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
