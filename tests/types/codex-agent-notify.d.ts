declare module "*codex/codex-agent-notify.mjs" {
  export interface CodexConfig {
    serverUrl: string;
    token: string;
    timeoutMs: number;
    debugLogPath?: string;
  }
  export function parseCodexConfig(raw: Record<string, unknown>): CodexConfig;
  export function shouldForwardCodexEvent(raw: unknown): boolean;
  export function summarizeCodexEventForDebug(raw: unknown): Record<string, unknown>;
  export function sendCodexEvent(
    serverUrl: string,
    token: string,
    timeoutMs: number,
    raw: unknown,
    fetchImpl?: typeof fetch,
  ): Promise<boolean>;
}
