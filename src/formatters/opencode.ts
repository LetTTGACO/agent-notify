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
const OPENCODE_ICON_URL = "https://opencode.ai/apple-touch-icon.png";

type UnknownRecord = Record<string, unknown>;

export interface FormatterOptions {
  language?: NotificationLanguage;
  cwd?: string;
}

const zhActionLabels: Record<string, string> = {
  bash: "运行命令",
  edit: "编辑文件",
  delete: "删除文件",
  remove: "删除文件",
  webfetch: "网页访问",
  websearch: "网页搜索",
  permission: "权限",
};

function languageFromOptions(options?: FormatterOptions): NotificationLanguage {
  return options?.language ?? defaultNotificationLanguage;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getProperties(raw: UnknownRecord): UnknownRecord {
  const properties = raw.properties;
  return isRecord(properties) ? properties : raw;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength = MAX_BODY_LENGTH): string {
  const text = oneLine(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function summarizeList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return truncate(
    value
      .map((item) => String(item))
      .map(oneLine)
      .filter(Boolean)
      .join(", "),
  );
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return oneLine(value);
  if (!isRecord(value)) return undefined;
  return (
    getString(value.message) ??
    getString(value.name) ??
    getString(value._tag)
  );
}

function requireRawRecord(raw: unknown): UnknownRecord {
  if (!isRecord(raw)) {
    throw new EventFormatError("OpenCode raw payload must be an object");
  }
  return raw;
}

function requireEventType(raw: UnknownRecord): string {
  const type = getString(raw.type);
  if (!type) {
    throw new EventFormatError("OpenCode raw payload is missing type");
  }
  return type;
}

function permissionTitle(action: string, language: NotificationLanguage): string {
  if (language === "en") return `Approve ${action}`;
  const label = zhActionLabels[action.toLowerCase()];
  return label ? `批准${label}` : `批准 ${action}`;
}

function permissionFallback(language: NotificationLanguage): string {
  return language === "zh" ? "请求权限" : "Permission requested";
}

function failedTitle(language: NotificationLanguage): string {
  return language === "zh" ? "失败" : "Failed";
}

function sessionErrorFallback(language: NotificationLanguage): string {
  return language === "zh" ? "会话错误" : "Session error";
}

function questionTitle(language: NotificationLanguage): string {
  return language === "zh" ? "需要回答" : "Question";
}

function questionFallback(language: NotificationLanguage): string {
  return language === "zh" ? "请选择一个回答" : "Choose an answer";
}

function completedTitle(language: NotificationLanguage): string {
  return language === "zh" ? "待审阅" : "Ready to review";
}

function completedBody(language: NotificationLanguage): string {
  return language === "zh" ? "看看结果或下一步" : "Review results or next steps";
}

function questionBody(properties: UnknownRecord, language: NotificationLanguage): string {
  const questions = properties.questions;
  if (Array.isArray(questions) && isRecord(questions[0])) {
    const question = getString(questions[0].question);
    if (question) return truncate(question);
  }
  return questionFallback(language);
}

export function formatOpenCodeEvent(
  event: IncomingAgentEvent,
  options?: FormatterOptions,
): FormattedAgentEvent {
  const language = languageFromOptions(options);
  const raw = requireRawRecord(event.raw);
  const sourceEvent = requireEventType(raw);
  const properties = getProperties(raw);
  const cwd = options?.cwd ?? raw.cwd;
  const title = (value: string) => prefixTitleWithProject(value, cwd);

  if (sourceEvent === "permission.v2.asked") {
    const action = getString(properties.action) ?? "permission";
    const body = summarizeList(properties.resources) || permissionFallback(language);

    return {
      agent: event.agent,
      kind: "permission_required",
      sourceEvent,
      sessionId: getString(properties.sessionID),
      notification: {
        title: title(permissionTitle(action, language)),
        body,
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: OPENCODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "permission.asked") {
    const permission = getString(properties.permission) ?? "permission";
    const body = summarizeList(properties.patterns) || permissionFallback(language);

    return {
      agent: event.agent,
      kind: "permission_required",
      sourceEvent,
      sessionId: getString(properties.sessionID),
      notification: {
        title: title(permissionTitle(permission, language)),
        body,
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: OPENCODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "question.asked") {
    return {
      agent: event.agent,
      kind: "question_required",
      sourceEvent,
      sessionId: getString(properties.sessionID),
      notification: {
        title: title(questionTitle(language)),
        body: questionBody(properties, language),
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: OPENCODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "session.idle") {
    return {
      agent: event.agent,
      kind: "completed",
      sourceEvent,
      sessionId: getString(properties.sessionID) ?? getString(raw.sessionID),
      notification: {
        title: title(completedTitle(language)),
        body: completedBody(language),
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: OPENCODE_ICON_URL,
      },
    };
  }

  if (sourceEvent === "session.error") {
    const body =
      errorMessage(properties.error) ??
      errorMessage(raw.error) ??
      getString(properties.message) ??
      getString(raw.message) ??
      sessionErrorFallback(language);

    return {
      agent: event.agent,
      kind: "failed",
      sourceEvent,
      sessionId: getString(properties.sessionID) ?? getString(raw.sessionID),
      notification: {
        title: title(failedTitle(language)),
        body: truncate(body),
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: OPENCODE_ICON_URL,
      },
    };
  }

  throw new EventFormatError(`Unsupported OpenCode event type: ${sourceEvent}`);
}
