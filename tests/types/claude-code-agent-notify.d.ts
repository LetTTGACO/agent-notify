declare module "*claude-code/claude-code-agent-notify.mjs" {
  export interface ClaudeCodeConfig {
    serverUrl: string;
    token: string;
    timeoutMs: number;
    debugLogPath?: string;
  }
  export function parseClaudeCodeConfig(raw: Record<string, unknown>): ClaudeCodeConfig;
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
