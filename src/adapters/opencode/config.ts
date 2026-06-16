export interface OpenCodeAdapterConfig {
  serverUrl: string;
  token: string;
  timeoutMs: number;
}

export function readOpenCodeConfig(env: NodeJS.ProcessEnv): OpenCodeAdapterConfig {
  return {
    serverUrl: env.AGENT_NOTIFY_SERVER_URL ?? "http://127.0.0.1:8787",
    token: env.AGENT_NOTIFY_TOKEN ?? "",
    timeoutMs: Number(env.AGENT_NOTIFY_TIMEOUT_MS ?? 2000),
  };
}
