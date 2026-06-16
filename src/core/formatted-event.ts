import type { IncomingAgentEvent } from "./incoming-event.js";
import type { NotificationPayload } from "../providers/types.js";

export type FormattedAgentKind =
  | "permission_required"
  | "question_required"
  | "failed";

export interface FormattedAgentEvent {
  agent: IncomingAgentEvent["agent"];
  kind: FormattedAgentKind;
  sourceEvent: string;
  sessionId?: string;
  notification: NotificationPayload;
}

export class EventFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventFormatError";
  }
}
