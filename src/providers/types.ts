export interface NotificationPayload {
  title: string;
  body: string;
  urgency: "normal" | "time_sensitive";
  group?: string;
  sound?: string;
  url?: string;
}

export interface NotificationResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface NotificationProvider {
  name: string;
  send(input: NotificationPayload): Promise<NotificationResult>;
}
