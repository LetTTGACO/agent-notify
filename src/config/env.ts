import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  defaultNotificationLanguage,
  notificationLanguages,
  type NotificationLanguage,
} from "../core/language.js";

export function loadDotenv(): void {
  try {
    const envPath = join(process.cwd(), ".env");
    const text = readFileSync(envPath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env missing or unreadable; not an error
  }
}

export interface NamedToken {
  name: string;
  value: string;
}

interface BaseAppConfig {
  host: string;
  port: number;
  tokens: NamedToken[];
  language: NotificationLanguage;
  logPath: string;
  logRaw: boolean;
  claudeCompletionMinSeconds: number;
  codexCompletionMinSeconds: number;
}

export type AppConfig =
  | (BaseAppConfig & {
      provider: "bark";
      barkEndpoint: string;
      ntfyEndpoint?: undefined;
      ntfyToken?: undefined;
    })
  | (BaseAppConfig & {
      provider: "ntfy";
      ntfyEndpoint: string;
      ntfyToken?: string;
      barkEndpoint?: undefined;
    });

// Treat empty strings as undefined so optional fields like endpoint URLs that
// are present but blank (e.g. `NTFY_ENDPOINT=` from .env.example or Docker's
// `${NTFY_ENDPOINT:-}`) don't fail URL validation. Only applied to optional
// string fields where absence is meaningful but an empty value is not.
function emptyStringToUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema,
  ) as unknown as T;
}

export function parseTokenList(value: string): NamedToken[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("AGENT_NOTIFY_TOKENS must contain at least one token");
  }

  return entries.map((entry) => {
    const index = entry.indexOf(":");
    if (index <= 0 || index === entry.length - 1) {
      throw new Error(`Invalid token entry: ${entry}`);
    }
    return {
      name: entry.slice(0, index),
      value: entry.slice(index + 1),
    };
  });
}

const envSchema = z
  .object({
    AGENT_NOTIFY_HOST: z.string().default("0.0.0.0"),
    AGENT_NOTIFY_PORT: z.coerce.number().int().positive().default(8787),
    AGENT_NOTIFY_TOKENS: z.string().min(1),
    AGENT_NOTIFY_PROVIDER: z.enum(["bark", "ntfy"]).default("bark"),
    AGENT_NOTIFY_LANGUAGE: z
      .enum(notificationLanguages)
      .default(defaultNotificationLanguage),
    BARK_ENDPOINT: emptyStringToUndefined(z.string().url().optional()),
    NTFY_ENDPOINT: emptyStringToUndefined(z.string().url().optional()),
    NTFY_TOKEN: emptyStringToUndefined(z.string().optional()),
    AGENT_NOTIFY_LOG_PATH: z.string().default("./data/events.jsonl"),
    AGENT_NOTIFY_LOG_RAW: z
      .enum(["true", "false", "1", "0"])
      .default("false"),
    AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS: z.coerce
      .number()
      .nonnegative()
      .default(0),
    AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS: z.coerce
      .number()
      .nonnegative()
      .default(0),
  })
  .superRefine((value, context) => {
    if (value.AGENT_NOTIFY_PROVIDER === "bark" && !value.BARK_ENDPOINT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BARK_ENDPOINT"],
        message: "BARK_ENDPOINT is required when AGENT_NOTIFY_PROVIDER=bark",
      });
    }
    if (value.AGENT_NOTIFY_PROVIDER === "ntfy" && !value.NTFY_ENDPOINT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NTFY_ENDPOINT"],
        message: "NTFY_ENDPOINT is required when AGENT_NOTIFY_PROVIDER=ntfy",
      });
    }
  });

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  loadDotenv();
  const parsed = envSchema.parse(env);
  const baseConfig = {
    host: parsed.AGENT_NOTIFY_HOST,
    port: parsed.AGENT_NOTIFY_PORT,
    tokens: parseTokenList(parsed.AGENT_NOTIFY_TOKENS),
    language: parsed.AGENT_NOTIFY_LANGUAGE,
    logPath: parsed.AGENT_NOTIFY_LOG_PATH,
    logRaw:
      parsed.AGENT_NOTIFY_LOG_RAW === "true" ||
      parsed.AGENT_NOTIFY_LOG_RAW === "1",
    claudeCompletionMinSeconds:
      parsed.AGENT_NOTIFY_CLAUDE_COMPLETION_MIN_SECONDS,
    codexCompletionMinSeconds:
      parsed.AGENT_NOTIFY_CODEX_COMPLETION_MIN_SECONDS,
  };

  if (parsed.AGENT_NOTIFY_PROVIDER === "ntfy") {
    return {
      ...baseConfig,
      provider: "ntfy",
      ntfyEndpoint: parsed.NTFY_ENDPOINT!,
      ntfyToken: parsed.NTFY_TOKEN?.trim() || undefined,
    };
  }

  return {
    ...baseConfig,
    provider: "bark",
    barkEndpoint: parsed.BARK_ENDPOINT!,
  };
}
