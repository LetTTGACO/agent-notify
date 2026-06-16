import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

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

export interface AppConfig {
  host: string;
  port: number;
  tokens: NamedToken[];
  provider: "bark";
  barkEndpoint: string;
  logPath: string;
  logRaw: boolean;
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
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  loadDotenv();
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
  };
}
