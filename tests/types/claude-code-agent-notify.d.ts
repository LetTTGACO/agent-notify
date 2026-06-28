declare module "*claude-code/claude-code-agent-notify.mjs" {
  export interface ClaudeCodeConfig {
    serverUrl: string;
    token: string;
    timeoutMs: number;
    debugLogPath?: string;
  }
  export type AgentNotifyCommand =
    | { type: "none" }
    | { type: "on" }
    | { type: "status" }
    | { type: "off-session" }
    | { type: "off-persist" }
    | { type: "off-until"; until: string }
    | { type: "invalid"; message: string };
  export interface AgentNotifySwitchState {
    persistentDisabled: boolean;
    temporaryDisabledUntil?: string;
    disabledSessions: Record<string, { disabledAt: string }>;
    readError?: string;
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
  export function parseAgentNotifyCommand(
    prompt: unknown,
    now?: Date,
  ): AgentNotifyCommand;
  export function getClaudeCodeSwitchStatePath(home?: string): string;
  export function readClaudeCodeSwitchState(statePath: string): AgentNotifySwitchState;
  export function writeClaudeCodeSwitchState(
    statePath: string,
    state: AgentNotifySwitchState,
  ): void;
  export function applyClaudeCodeSwitchCommand(
    state: AgentNotifySwitchState,
    command: AgentNotifyCommand,
    sessionId?: string,
    now?: Date,
  ): { state: AgentNotifySwitchState; message: string };
  export function getClaudeCodeMuteReason(
    state: AgentNotifySwitchState,
    sessionId?: string,
    now?: Date,
  ): "persistent" | "timed" | "session" | undefined;
  export function handleClaudeCodeEvent(
    config: ClaudeCodeConfig,
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
