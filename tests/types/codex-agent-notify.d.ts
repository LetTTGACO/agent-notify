declare module "*codex/codex-agent-notify.mjs" {
  export interface CodexConfig {
    serverUrl: string;
    token: string;
    timeoutMs: number;
    debugLogPath?: string;
  }
  export type AgentNotifyCommand =
    | { type: "none" }
    | { type: "on" }
    | { type: "status" }
    | { type: "clear-sessions" }
    | { type: "off-session" }
    | { type: "off-persist" }
    | { type: "off-until"; until: string }
    | { type: "invalid"; message: string };
  export interface AgentNotifySwitchState {
    persistentDisabled: boolean;
    temporaryDisabledUntil?: string;
    currentSessionId?: string;
    disabledSessions: Record<string, { disabledAt: string }>;
    readError?: string;
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
  export function parseAgentNotifyCommand(
    prompt: unknown,
    now?: Date,
  ): AgentNotifyCommand;
  export function getCodexSwitchStatePath(home?: string): string;
  export function readCodexSwitchState(statePath: string): AgentNotifySwitchState;
  export function writeCodexSwitchState(
    statePath: string,
    state: AgentNotifySwitchState,
  ): void;
  export function applyCodexSwitchCommand(
    state: AgentNotifySwitchState,
    command: AgentNotifyCommand,
    sessionId?: string,
    now?: Date,
  ): { state: AgentNotifySwitchState; message: string };
  export function getCodexMuteReason(
    state: AgentNotifySwitchState,
    sessionId?: string,
    now?: Date,
  ): "persistent" | "timed" | "session" | undefined;
  export function handleCodexEvent(
    config: CodexConfig,
    raw: unknown,
    deps?: {
      fetchImpl?: typeof fetch;
      now?: Date;
      statePath?: string;
      readState?: (statePath: string) => AgentNotifySwitchState;
      writeState?: (statePath: string, state: AgentNotifySwitchState) => void;
    },
  ): Promise<Record<string, unknown>>;
}
