export const notificationLanguages = ["en", "zh"] as const;

export type NotificationLanguage = (typeof notificationLanguages)[number];

export const defaultNotificationLanguage: NotificationLanguage = "en";
