import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailDispatchProcessor } from './email-dispatch.processor';
import { MailService } from '../../../common/mail/mail.service';
import { NotificationsService } from '../notifications.service';
import { AppConfigService } from '../../../config/config.service';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

function makeJob(overrides: Record<string, unknown> = {}): { data: Record<string, unknown> } {
  return {
    data: {
      recipientId: 'emp-uuid-1',
      recipientEmail: 'emp@test.com',
      templateName: 'leave_approved',
      templateData: {
        leaveType: 'Annual',
        startDate: '2025-02-01',
        endDate: '2025-02-05',
        approverName: 'Manager Bob',
        decision: 'APPROVED',
      },
      notificationPayload: {
        type: 'LEAVE_APPROVED',
        title: 'Leave Approved',
        body: 'Your leave has been approved.',
        metadata: {},
        companyId: 'company-1',
      },
      ...overrides,
    },
  };
}

describe('EmailDispatchProcessor', () => {
  let processor: EmailDispatchProcessor;
  let mockMailService: { send: ReturnType<typeof vi.fn>; renderTemplate: ReturnType<typeof vi.fn> };
  let mockNotificationsService: { create: ReturnType<typeof vi.fn> };
  let mockConfig: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMailService = {
      send: vi.fn().mockResolvedValue(undefined),
      renderTemplate: vi.fn((_subj: string, body: string) => `<html>${body}</html>`),
    };
    mockNotificationsService = {
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    mockConfig = {
      get: vi.fn().mockReturnValue(undefined),
    };

    processor = new EmailDispatchProcessor(
      mockMailService as any,
      mockNotificationsService as any,
      mockConfig as any,
    );
  });

  // =====================================================================
  // Test Group 1: template rendering
  // =====================================================================
  describe('template rendering', () => {
    it('renders leave_requested template with correct variables', async () => {
      const job = makeJob({
        templateName: 'leave_requested',
        templateData: {
          employeeName: 'Alice',
          leaveType: 'Annual',
          startDate: '2025-02-01',
          endDate: '2025-02-05',
        },
        notificationPayload: {
          type: 'LEAVE_REQUESTED',
          title: 'Alice requested leave',
          body: '...',
          companyId: 'company-1',
        },
      });

      await processor.process(job as any);

      expect(mockMailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'emp@test.com',
          subject: expect.stringContaining('Alice'),
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LEAVE_REQUESTED',
          emailSent: true,
        }),
      );
    });

    it('throws when required template variable is missing', async () => {
      const job = makeJob({
        templateName: 'leave_requested',
        templateData: { leaveType: 'Annual' }, // employeeName is missing
      });

      await expect(processor.process(job as any)).rejects.toThrow(
        'Missing template variables: employeeName',
      );

      expect(mockMailService.send).not.toHaveBeenCalled();
      // Still inserts notification with emailSent=false on validation failure path
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailSent: false }),
      );
    });
  });

  // =====================================================================
  // Test Group 2: all five templates validated (parameterized)
  // =====================================================================
  describe('template variable validation — all templates', () => {
    it.each([
      ['leave_requested', { leaveType: 'Annual' }, 'employeeName'],
      ['leave_approved', { approverName: 'Bob' }, 'leaveType'],
      ['payslip_ready', {}, 'period'],
      ['policy_published', { policyTitle: 'Code of Conduct' }, 'category'],
      ['esign_request', { documentName: 'Contract' }, 'expiresAt'],
    ])(
      'template %s throws when %s is missing',
      async (templateName, incompleteData, _missingVar) => {
        const job = makeJob({ templateName, templateData: incompleteData });

        await expect(processor.process(job as any)).rejects.toThrow(
          'Missing template variables',
        );
      },
    );
  });

  // =====================================================================
  // Test Group 3: feature-flag check
  // =====================================================================
  describe('feature-flag check', () => {
    it('does not send when template is disabled via ConfigService', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'NOTIFICATIONS_PAYSLIP_READY_ENABLED') return 'false';
        return undefined;
      });

      const job = makeJob({
        templateName: 'payslip_ready',
        templateData: { period: 'June 2025' },
        notificationPayload: {
          type: 'PAYSLIP_READY',
          title: 'Payslip Ready',
          body: '...',
          companyId: 'company-1',
        },
      });

      await processor.process(job as any);

      expect(mockMailService.send).not.toHaveBeenCalled();
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emailSent: false,
          metadata: expect.objectContaining({ skippedReason: 'template_disabled' }),
        }),
      );
    });

    it('sends when template is enabled (default)', async () => {
      mockConfig.get.mockReturnValue(undefined); // no disable flag set

      const job = makeJob({
        templateName: 'leave_approved',
      });

      await processor.process(job as any);

      expect(mockMailService.send).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Test Group 4: send failure handling
  // =====================================================================
  describe('send failure handling', () => {
    it('inserts notification with emailSent=false when send fails', async () => {
      mockMailService.send.mockRejectedValue(new Error('rate limited'));

      const job = makeJob({
        templateName: 'leave_approved',
      });

      await expect(processor.process(job as any)).rejects.toThrow('rate limited');

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          emailSent: false,
          emailSentAt: null,
        }),
      );
    });
  });
});
