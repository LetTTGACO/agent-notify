import type { AgentEvent } from "./events.js";
import type { NotificationPayload } from "../providers/types.js";

function shortenCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const parts = cwd.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

export function formatNotification(event: AgentEvent): NotificationPayload {
  const shortCwd = shortenCwd(event.cwd);
  const details = [
    event.message,
    event.project ? `Project: ${event.project}` : undefined,
    shortCwd ? `Path: ${shortCwd}` : undefined,
  ].filter(Boolean);

  return {
    title: `[${event.agent}] ${event.title}`,
    body: details.join("\n") || event.kind,
    urgency:
      event.kind === "permission_required" || event.kind === "failed"
        ? "time_sensitive"
        : "normal",
    group: "AgentNotify",
  };
}
