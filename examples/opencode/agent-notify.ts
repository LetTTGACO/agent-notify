import { mapOpenCodeEvent, sendOpenCodeEvent } from "../../src/adapters/opencode/map-event.js";
import { readOpenCodeConfig } from "../../src/adapters/opencode/config.js";

const config = readOpenCodeConfig(process.env);

async function notify(sourceEvent: string, payload: Record<string, unknown>) {
  const event = mapOpenCodeEvent(sourceEvent, payload, config.project);
  if (!event || !config.token) return;

  const safeEvent = config.includeRaw ? event : { ...event, raw: undefined };
  await sendOpenCodeEvent(config, safeEvent);
}

export default async function agentNotifyPlugin({ event }: { event: { on: Function } }) {
  event.on("permission.asked", (payload: Record<string, unknown>) =>
    notify("permission.asked", payload),
  );
  event.on("session.error", (payload: Record<string, unknown>) =>
    notify("session.error", payload),
  );
  event.on("session.idle", (payload: Record<string, unknown>) =>
    notify("session.idle", payload),
  );
  event.on("permission.replied", (payload: Record<string, unknown>) =>
    notify("permission.replied", payload),
  );
}
