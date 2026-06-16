import type { IncomingAgentEvent } from "../core/incoming-event.js";
import type { FormattedAgentEvent } from "../core/formatted-event.js";
import {
  formatOpenCodeEvent,
  type FormatterOptions,
} from "./opencode.js";

export function formatIncomingEvent(
  event: IncomingAgentEvent,
  options?: FormatterOptions,
): FormattedAgentEvent {
  return formatOpenCodeEvent(event, options);
}
