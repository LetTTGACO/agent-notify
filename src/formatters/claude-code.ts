import type { IncomingAgentEvent } from "../core/incoming-event.js";
import {
  EventFormatError,
  type FormattedAgentEvent,
} from "../core/formatted-event.js";
import {
  defaultNotificationLanguage,
  type NotificationLanguage,
} from "../core/language.js";
import { prefixTitleWithProject } from "./project-title.js";

const MAX_BODY_LENGTH = 80;
const CLAUDE_CODE_ICON_URL =
  "https://cdn.jsdelivr.net/gh/LetTTGACO/agent-notify@main/assets/claude-code.png";

type UnknownRecord = Record<string, unknown>;

export interface FormatterOptions {
  language?: NotificationLanguage;
  cwd?: string;
}

function languageFromOptions(options?: FormatterOptions): NotificationLanguage {
  return options?.language ?? defaultNotificationLanguage;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength = MAX_BODY_LENGTH): string {
  const text = oneLine(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function requireRawRecord(raw: unknown): UnknownRecord {
  if (!isRecord(raw)) {
    throw new EventFormatError("Claude Code raw payload must be an object");
  }
  return raw;
}

function requireHookEvent(raw: UnknownRecord): string {
  const hookEvent = getString(raw.hook_event_name);
  if (!hookEvent) {
    throw new EventFormatError("Claude Code raw payload is missing hook_event_name");
  }
  return hookEvent;
}

function permissionTitle(language: NotificationLanguage): string {
  return language === "zh" ? "需要批准" : "Approve permission";
}

function questionTitle(language: NotificationLanguage): string {
  return language === "zh" ? "需要回答" : "Question";
}

function completedTitle(language: NotificationLanguage): string {
  return language === "zh" ? "待审阅" : "Ready to review";
}

function completedBody(language: NotificationLanguage): string {
  return language === "zh" ? "看看结果或下一步" : "Review results or next steps";
}

function failedTitle(language: NotificationLanguage): string {
  return language === "zh" ? "失败" : "Failed";
}

function notificationFallback(language: NotificationLanguage): string {
  return language === "zh" ? "请回到终端查看" : "Check the terminal";
}

function failedFallback(language: NotificationLanguage): string {
  return language === "zh" ? "任务异常终止" : "Task failed";
}

function notificationMessage(raw: UnknownRecord, language: NotificationLanguage): string {
  return truncate(
    getString(raw.message) ??
      getString(raw.title) ??
      notificationFallback(language),
  );
}

function failureMessage(raw: UnknownRecord, language: NotificationLanguage): string {
  return truncate(
    getString(raw.error_details) ??
      getString(raw.last_assistant_message) ??
      getString(raw.message) ??
      getString(raw.error) ??
      failedFallback(language),
  );
}

function sessionId(raw: UnknownRecord): string | undefined {
  return getString(raw.session_id);
}

export function formatClaudeCodeEvent(
  event: IncomingAgentEvent,
  options?: FormatterOptions,
): FormattedAgentEvent {
  const language = languageFromOptions(options);
  const raw = requireRawRecord(event.raw);
  const sourceEvent = requireHookEvent(raw);
  const cwd = options?.cwd ?? raw.cwd;
  const title = (value: string) => prefixTitleWithProject(value, cwd);

  if (sourceEvent === "Notification") {
    const notificationType = getString(raw.notification_type);
    const isPermission = notificationType === "permission_prompt";

    return {
      agent: event.agent,
      kind: isPermission ? "permission_required" : "question_required",
      sourceEvent,
      sessionId: sessionId(raw),
      notification: {
        title: title(isPermission ? permissionTitle(language) : questionTitle(language)),
        body: notificationMessage(raw, language),
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: CLAUDE_CODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "Stop") {
    return {
      agent: event.agent,
      kind: "completed",
      sourceEvent,
      sessionId: sessionId(raw),
      notification: {
        title: title(completedTitle(language)),
        body: completedBody(language),
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: CLAUDE_CODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "StopFailure") {
    return {
      agent: event.agent,
      kind: "failed",
      sourceEvent,
      sessionId: sessionId(raw),
      notification: {
        title: title(failedTitle(language)),
        body: failureMessage(raw, language),
        urgency: "time_sensitive",
        group: "Claude Code",
        icon: CLAUDE_CODE_ICON_URL,
      },
    };
  }

  throw new EventFormatError(`Unsupported Claude Code hook event: ${sourceEvent}`);
}
