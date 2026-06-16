import { z } from "zod";

const rawPayloadSchema = z.custom<unknown>(
  (value) => value !== undefined,
  { message: "raw is required" },
);

export const incomingAgentEventSchema = z
  .object({
    agent: z.enum(["opencode", "claude-code"]),
    raw: rawPayloadSchema,
  })
  .strict();

export type IncomingAgentEvent = z.infer<typeof incomingAgentEventSchema>;

export function parseIncomingAgentEvent(input: unknown): IncomingAgentEvent {
  return incomingAgentEventSchema.parse(input);
}
