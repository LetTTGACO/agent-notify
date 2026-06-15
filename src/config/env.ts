import { z } from "zod";

export interface NamedToken {
  name: string;
  value: string;
}

export interface AppConfig {
  host: string;
  port: number;
  tokens: NamedToken[];
  provider: "bark";
  barkEndpoint: string;
  logPath: string;
  logRaw: boolean;
  dedupeSeconds: number;
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

const envSchema = z.object({
  AGENT_NOTIFY_HOST: z.string().default("0.0.0.0"),
  AGENT_NOTIFY_PORT: z.coerce.number().int().positive().default(8787),
  AGENT_NOTIFY_TOKENS: z.string().min(1),
  AGENT_NOTIFY_PROVIDER: z.literal("bark").default("bark"),
  BARK_ENDPOINT: z.string().url(),
  AGENT_NOTIFY_LOG_PATH: z.string().default("./data/events.jsonl"),
  AGENT_NOTIFY_LOG_RAW: z
    .enum(["true", "false", "1", "0"])
    .default("false"),
  AGENT_NOTIFY_DEDUPE_SECONDS: z.coerce.number().int().positive().default(30),
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    host: parsed.AGENT_NOTIFY_HOST,
    port: parsed.AGENT_NOTIFY_PORT,
    tokens: parseTokenList(parsed.AGENT_NOTIFY_TOKENS),
    provider: parsed.AGENT_NOTIFY_PROVIDER,
    barkEndpoint: parsed.BARK_ENDPOINT,
    logPath: parsed.AGENT_NOTIFY_LOG_PATH,
    logRaw:
      parsed.AGENT_NOTIFY_LOG_RAW === "true" ||
      parsed.AGENT_NOTIFY_LOG_RAW === "1",
    dedupeSeconds: parsed.AGENT_NOTIFY_DEDUPE_SECONDS,
  };
}
