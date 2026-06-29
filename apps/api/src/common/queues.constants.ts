export const QUEUE_NAMES = {
  EMAIL_DISPATCH: 'email_dispatch',
  AUDIT_EXPORT: 'audit_export',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
