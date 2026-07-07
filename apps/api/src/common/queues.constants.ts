export const QUEUE_NAMES = {
  EMAIL_DISPATCH: 'email_dispatch',
  AUDIT_EXPORT: 'audit_export',
  REPORT_EXPORT: 'report_export',
  SCHEDULE_DISPATCHER: 'schedule_dispatcher',
  RESUME_PARSING: 'recruitment.resume-parsing',
  OFFER_EXPIRY: 'recruitment.offer-expiry',
  RECRUITMENT_NOTIFICATIONS: 'recruitment.notifications',
  ONBOARDING_TASK_REMINDER: 'onboarding.task-reminder',
  REVIEW_DEADLINE_CHECK: 'performance.review-deadline-check',
  CERTIFICATE_GENERATION: 'lms.certificate-generation',
  TRAINING_DEADLINE_REMINDER: 'lms.training-deadline-reminder',
  CERTIFICATION_EXPIRY_CHECK: 'certification.expiry-check',
  VESTING_CRON: 'compensation.vesting-cron',
  ENROLLMENT_WINDOW_CLOSE: 'benefits.enrollment-window-close',
  SURVEY_CLOSE: 'survey.close',
  ADVANCE_RECOVERY: 'payroll.advance-recovery',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
