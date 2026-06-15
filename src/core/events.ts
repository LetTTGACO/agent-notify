import { z } from "zod";

export const agentNameSchema = z.enum(["opencode", "claude", "codex"]);

export const agentEventKindSchema = z.enum([
  "permission_required",
  "completed",
  "failed",
  "attention",
]);

export const agentEventSchema = z.object({
  agent: agentNameSchema,
  kind: agentEventKindSchema,
  title: z.string().min(1),
  message: z.string().optional(),
  project: z.string().optional(),
  sessionId: z.string().optional(),
  cwd: z.string().optional(),
  sourceEvent: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  raw: z.unknown().optional(),
});

export type AgentName = z.infer<typeof agentNameSchema>;
export type AgentEventKind = z.infer<typeof agentEventKindSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

export function parseAgentEvent(input: unknown): AgentEvent {
  return agentEventSchema.parse(input);
}
