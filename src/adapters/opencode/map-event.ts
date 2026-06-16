const NOTIFY_EVENT_TYPES = new Set([
  "permission.v2.asked",
  "permission.asked",
  "session.error",
]);

export function shouldNotifyOpenCodeEvent(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }
  const type = (raw as { type?: unknown }).type;
  return typeof type === "string" && NOTIFY_EVENT_TYPES.has(type);
}

export async function sendOpenCodeEvent(
  config: { serverUrl: string; token: string; timeoutMs: number },
  raw: unknown,
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
      body: JSON.stringify({ agent: "opencode", raw }),
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
