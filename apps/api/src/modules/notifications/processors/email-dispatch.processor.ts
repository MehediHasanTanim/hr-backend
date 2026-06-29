import { Inject, Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../../common/mail/mail.service';
import { NotificationsService } from '../notifications.service';
import { AppConfigService } from '../../../config/config.service';
import type { EmailDispatchJob } from '../notifications.service';

/**
 * Per-template required variable validation map.
 * Before rendering, the processor validates all required variables are present.
 */
const REQUIRED_TEMPLATE_VARS: Record<string, string[]> = {
  leave_requested: ['employeeName', 'leaveType', 'startDate', 'endDate'],
  leave_approved: ['leaveType', 'startDate', 'endDate', 'approverName', 'decision'],
  payslip_ready: ['period'],
  policy_published: ['policyTitle', 'category'],
  esign_request: ['documentName', 'expiresAt'],
};

/**
 * Simple inline template map for email rendering.
 */
const TEMPLATES: Record<
  string,
  (data: Record<string, unknown>) => { subject: string; body: string }
> = {
  leave_requested: (data) => ({
    subject: `${data.employeeName} has requested leave`,
    body: `<p><strong>${data.employeeName}</strong> has requested <strong>${data.leaveType}</strong> leave from <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong>.</p><p>Please review and approve or reject the request.</p>`,
  }),
  leave_approved: (data) => ({
    subject: `Your ${data.leaveType} leave has been ${data.decision ?? 'approved'}`,
    body: `<p>Your <strong>${data.leaveType}</strong> leave from <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> has been <strong>${data.decision ?? 'approved'}</strong> by <strong>${data.approverName}</strong>.</p>`,
  }),
  payslip_ready: (data) => ({
    subject: `Your payslip for ${data.period} is ready`,
    body: `<p>Your payslip for <strong>${data.period}</strong> is ready. Please log in to view it.</p>`,
  }),
  policy_published: (data) => ({
    subject: `New policy published: ${data.policyTitle}`,
    body: `<p>A new policy <strong>${data.policyTitle}</strong> (category: <strong>${data.category}</strong>) has been published. Please review and acknowledge it.</p>`,
  }),
  esign_request: (data) => ({
    subject: `Document pending your signature: ${data.documentName}`,
    body: `<p>You have a document pending your signature: <strong>${data.documentName}</strong>. This request expires on <strong>${data.expiresAt}</strong>.</p>`,
  }),
};

@Injectable()
export class EmailDispatchProcessor {
  private readonly logger = new Logger(EmailDispatchProcessor.name);

  constructor(
    @Inject(MailService) private readonly mailService: MailService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  /**
   * Process an email dispatch job.
   * Called by BullMQ processor or directly for testing.
   */
  async process(job: { data: EmailDispatchJob }): Promise<void> {
    const { recipientId, recipientEmail, templateName, templateData, notificationPayload } =
      job.data;

    // Validate unknown template
    const template = TEMPLATES[templateName];
    if (!template) {
      this.logger.error(`Unknown template: ${templateName}`);
      throw new Error(`Unknown email template: ${templateName}`);
    }

    // Validate required template variables — if missing, insert failure notification and throw
    try {
      this.validateTemplateVars(templateName, templateData);
    } catch (validationErr) {
      await this.notificationsService.create({
        userId: recipientId,
        companyId: notificationPayload.companyId,
        type: notificationPayload.type,
        title: notificationPayload.title,
        body: notificationPayload.body,
        metadata: notificationPayload.metadata,
        channel: 'EMAIL',
        emailSent: false,
        emailSentAt: null,
      });
      throw validationErr;
    }

    // Check feature flag — skip sending if disabled
    const enabledKey = `NOTIFICATIONS_${templateName.toUpperCase()}_ENABLED`;
    const isEnabled = this.config.get(enabledKey as never) !== 'false';

    if (!isEnabled) {
      this.logger.log(`Template ${templateName} is disabled, skipping send`);
      await this.notificationsService.create({
        userId: recipientId,
        companyId: notificationPayload.companyId,
        type: notificationPayload.type,
        title: notificationPayload.title,
        body: notificationPayload.body,
        metadata: {
          ...(notificationPayload.metadata ?? {}),
          skippedReason: 'template_disabled',
        },
        channel: 'IN_APP',
        emailSent: false,
        emailSentAt: null,
      });
      return;
    }

    const { subject, body } = template(templateData);
    const html = this.mailService.renderTemplate(subject, body);

    try {
      await this.mailService.send({
        to: recipientEmail,
        subject,
        html,
      });

      // Insert notification with emailSent = true
      await this.notificationsService.create({
        userId: recipientId,
        companyId: notificationPayload.companyId,
        type: notificationPayload.type,
        title: notificationPayload.title,
        body: notificationPayload.body,
        metadata: notificationPayload.metadata,
        channel: 'EMAIL',
        emailSent: true,
        emailSentAt: new Date(),
      });

      this.logger.log(`Email sent to ${recipientEmail}: ${subject}`);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${recipientEmail}: ${subject}`,
        err,
      );

      // Still insert notification with emailSent = false
      await this.notificationsService.create({
        userId: recipientId,
        companyId: notificationPayload.companyId,
        type: notificationPayload.type,
        title: notificationPayload.title,
        body: notificationPayload.body,
        metadata: notificationPayload.metadata,
        channel: 'EMAIL',
        emailSent: false,
        emailSentAt: null,
      });

      throw err; // Let BullMQ retry
    }
  }

  /**
   * Validate that all required template variables are present.
   * Throws Error with missing variable names if any are absent.
   */
  private validateTemplateVars(
    templateName: string,
    templateData: Record<string, unknown>,
  ): void {
    const required = REQUIRED_TEMPLATE_VARS[templateName];
    if (!required) return;

    const missing = required.filter(
      (varName) =>
        templateData[varName] === undefined ||
        templateData[varName] === null,
    );

    if (missing.length > 0) {
      throw new Error(`Missing template variables: ${missing.join(', ')}`);
    }
  }
}
