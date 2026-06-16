// OpenCode plugin: forwards notification-worthy events to agent-notify server.
// Copy this file to ~/.config/opencode/plugins/ or .opencode/plugins/.
// Required env: AGENT_NOTIFY_TOKEN. Optional: AGENT_NOTIFY_SERVER_URL, AGENT_NOTIFY_TIMEOUT_MS.

const NOTIFY_EVENT_TYPES = new Set([
  "permission.v2.asked",
  "permission.asked",
  "session.error",
]);

function shouldNotify(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return false;
  }
  const type = (raw as { type?: unknown }).type;
  return typeof type === "string" && NOTIFY_EVENT_TYPES.has(type);
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

const SERVER_URL = process.env.AGENT_NOTIFY_SERVER_URL ?? "http://127.0.0.1:8787";
const TOKEN = process.env.AGENT_NOTIFY_TOKEN ?? "";
const TIMEOUT_MS = Number(process.env.AGENT_NOTIFY_TIMEOUT_MS ?? 2000);

async function notify(raw: unknown) {
  if (!TOKEN) return;
  if (!shouldNotify(raw)) return;
  await sendOpenCodeEvent(SERVER_URL, TOKEN, TIMEOUT_MS, raw);
}

// OpenCode plugin: use the unified `event` hook so we receive the real event
// object, including v1 and v2 permission event shapes.
// See https://opencode.ai/docs/plugins/ for the plugin API.
export const AgentNotifyPlugin = async () => {
  return {
    event: async ({ event }: { event: { type: string; [key: string]: unknown } }) => {
      await notify(event);
    },
  };
};

export default AgentNotifyPlugin;
