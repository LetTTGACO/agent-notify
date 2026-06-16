import type { NotificationPayload, NotificationProvider, NotificationResult } from "./types.js";

type FetchLike = typeof fetch;

export class BarkProvider implements NotificationProvider {
  readonly name = "bark";

  constructor(
    private readonly endpoint: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(input: NotificationPayload): Promise<NotificationResult> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          group: input.group,
          sound: input.sound,
          url: input.url,
          icon: input.icon,
          level: input.urgency === "time_sensitive" ? "timeSensitive" : "active",
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `Bark returned HTTP ${response.status}`,
        };
      }

      return { ok: true, status: response.status };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
