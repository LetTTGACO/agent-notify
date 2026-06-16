import type { IncomingAgentEvent } from "../core/incoming-event.js";
import type { FormattedAgentEvent } from "../core/formatted-event.js";
import {
  formatClaudeCodeEvent,
  type FormatterOptions,
} from "./claude-code.js";
import { formatOpenCodeEvent } from "./opencode.js";

export function formatIncomingEvent(
  event: IncomingAgentEvent,
  options?: FormatterOptions,
): FormattedAgentEvent {
  if (event.agent === "claude-code") {
    return formatClaudeCodeEvent(event, options);
  }
  return formatOpenCodeEvent(event, options);
}
