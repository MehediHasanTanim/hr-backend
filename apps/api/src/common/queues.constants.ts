export const QUEUE_NAMES = {
  EMAIL_DISPATCH: 'email_dispatch',
  AUDIT_EXPORT: 'audit_export',
  REPORT_EXPORT: 'report_export',
  SCHEDULE_DISPATCHER: 'schedule_dispatcher',
  RESUME_PARSING: 'recruitment.resume-parsing',
  OFFER_EXPIRY: 'recruitment.offer-expiry',
  RECRUITMENT_NOTIFICATIONS: 'recruitment.notifications',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
