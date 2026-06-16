declare module "*claude-code/agent-notify.mjs" {
  export function shouldForwardClaudeCodeEvent(raw: unknown): boolean;
  export function summarizeClaudeCodeEventForDebug(raw: unknown): Record<string, unknown>;
  export function sendClaudeCodeEvent(
    serverUrl: string,
    token: string,
    timeoutMs: number,
    raw: unknown,
    fetchImpl?: typeof fetch,
  ): Promise<boolean>;
}
