export const NotificationChannelType = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  PUSH: 'PUSH',
} as const;

export type NotificationChannelType =
  | (typeof NotificationChannelType)[keyof typeof NotificationChannelType]
  | (string & {});

export const isNotificationChannelType = (value: unknown): value is NotificationChannelType => {
  return typeof value === 'string' && value.trim().length > 0;
};
