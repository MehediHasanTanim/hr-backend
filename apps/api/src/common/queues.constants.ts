export const QUEUE_NAMES = {
  EMAIL_DISPATCH: 'email_dispatch',
  AUDIT_EXPORT: 'audit_export',
  REPORT_EXPORT: 'report_export',
  SCHEDULE_DISPATCHER: 'schedule_dispatcher',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
