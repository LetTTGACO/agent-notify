import type { IncomingAgentEvent } from "../core/incoming-event.js";
import {
  EventFormatError,
  type FormattedAgentEvent,
} from "../core/formatted-event.js";
import {
  defaultNotificationLanguage,
  type NotificationLanguage,
} from "../core/language.js";

const MAX_BODY_LENGTH = 80;
const CODEX_ICON_URL = "https://openai.com/favicon.ico";

type UnknownRecord = Record<string, unknown>;

export interface FormatterOptions {
  language?: NotificationLanguage;
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
    throw new EventFormatError("Codex raw payload must be an object");
  }
  return raw;
}

function requireHookEvent(raw: UnknownRecord): string {
  const hookEvent = getString(raw.hook_event_name);
  if (!hookEvent) {
    throw new EventFormatError("Codex raw payload is missing hook_event_name");
  }
  return hookEvent;
}

function toolInput(raw: UnknownRecord): UnknownRecord {
  return isRecord(raw.tool_input) ? raw.tool_input : {};
}

function sessionId(raw: UnknownRecord): string | undefined {
  return getString(raw.session_id);
}

function permissionTitle(language: NotificationLanguage): string {
  return language === "zh" ? "需要批准" : "Approve permission";
}

function completedTitle(language: NotificationLanguage): string {
  return language === "zh" ? "待审阅" : "Ready to review";
}

function permissionFallback(language: NotificationLanguage): string {
  return language === "zh" ? "请回到 Codex 查看" : "Check Codex";
}

function completedFallback(language: NotificationLanguage): string {
  return language === "zh" ? "看看结果或下一步" : "Review results or next steps";
}

function permissionBody(raw: UnknownRecord, language: NotificationLanguage): string {
  const input = toolInput(raw);
  return truncate(
    getString(input.description) ??
      getString(input.command) ??
      getString(raw.tool_name) ??
      permissionFallback(language),
  );
}

function completionBody(raw: UnknownRecord, language: NotificationLanguage): string {
  return truncate(
    getString(raw.last_assistant_message) ?? completedFallback(language),
  );
}

export function formatCodexEvent(
  event: IncomingAgentEvent,
  options?: FormatterOptions,
): FormattedAgentEvent {
  const language = languageFromOptions(options);
  const raw = requireRawRecord(event.raw);
  const sourceEvent = requireHookEvent(raw);

  if (sourceEvent === "PermissionRequest") {
    return {
      agent: event.agent,
      kind: "permission_required",
      sourceEvent,
      sessionId: sessionId(raw),
      notification: {
        title: permissionTitle(language),
        body: permissionBody(raw, language),
        urgency: "time_sensitive",
        group: "Codex",
        icon: CODEX_ICON_URL,
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
        title: completedTitle(language),
        body: completionBody(raw, language),
        urgency: "time_sensitive",
        group: "Codex",
        icon: CODEX_ICON_URL,
      },
    };
  }

  throw new EventFormatError(`Unsupported Codex hook event: ${sourceEvent}`);
}
