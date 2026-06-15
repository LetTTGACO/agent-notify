export interface OpenCodeAdapterConfig {
  serverUrl: string;
  token: string;
  project?: string;
  includeRaw?: boolean;
  timeoutMs: number;
}

export function readOpenCodeConfig(env: NodeJS.ProcessEnv): OpenCodeAdapterConfig {
  return {
    serverUrl: env.AGENT_NOTIFY_SERVER_URL ?? "http://127.0.0.1:8787",
    token: env.AGENT_NOTIFY_TOKEN ?? "",
    project: env.AGENT_NOTIFY_PROJECT,
    includeRaw: env.AGENT_NOTIFY_INCLUDE_RAW === "true",
    timeoutMs: Number(env.AGENT_NOTIFY_TIMEOUT_MS ?? 2000),
  };
}
