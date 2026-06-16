import type { IncomingAgentEvent } from "../core/incoming-event.js";
import type { FormattedAgentEvent } from "../core/formatted-event.js";
import { formatOpenCodeEvent } from "./opencode.js";

export function formatIncomingEvent(
  event: IncomingAgentEvent,
): FormattedAgentEvent {
  return formatOpenCodeEvent(event);
}
