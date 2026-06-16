declare module "*codex/agent-notify.mjs" {
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
