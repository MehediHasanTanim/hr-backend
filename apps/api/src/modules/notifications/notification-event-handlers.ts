import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { DomainEventsService } from '../../employees/events/domain-events.service';
import { EmailDispatchProcessor } from '../processors/email-dispatch.processor';
import type { EmailDispatchJob } from '../notifications.service';
import {
  LEAVE_REQUESTED,
  LEAVE_APPROVED,
  LEAVE_REJECTED,
  PAYSLIP_READY,
  POLICY_PUBLISHED,
  ESIGN_REQUEST_CREATED,
} from '../../../common/events/hr-events.constants';

@Injectable()
export class NotificationEventHandlers {
  private readonly logger = new Logger(NotificationEventHandlers.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
    @Inject(EmailDispatchProcessor)
    private readonly emailProcessor: EmailDispatchProcessor,
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // hr.leave.requested → notify manager
    this.events.on<LeaveRequestedPayload>(LEAVE_REQUESTED, (payload) =>
      this.handleLeaveRequested(payload),
    );

    // hr.leave.approved → notify employee
    this.events.on<LeaveDecisionPayload>(LEAVE_APPROVED, (payload) =>
      this.handleLeaveDecision(payload, 'APPROVED'),
    );

    // hr.leave.rejected → notify employee
    this.events.on<LeaveDecisionPayload>(LEAVE_REJECTED, (payload) =>
      this.handleLeaveDecision(payload, 'REJECTED'),
    );

    // hr.payslip.ready → notify employee
    this.events.on<PayslipReadyPayload>(PAYSLIP_READY, (payload) =>
      this.handlePayslipReady(payload),
    );

    // hr.policy.published → notify all active employees
    this.events.on<PolicyPublishedPayload>(POLICY_PUBLISHED, (payload) =>
      this.handlePolicyPublished(payload),
    );

    // hr.esign.request_created → notify signer
    this.events.on<EsignRequestCreatedPayload>(ESIGN_REQUEST_CREATED, (payload) =>
      this.handleEsignRequest(payload),
    );
  }

  private async handleLeaveRequested(payload: LeaveRequestedPayload): Promise<void> {
    try {
      const manager = await this.prisma.unscopedClient.employee.findUnique({
        where: { id: payload.managerId },
        select: {
          id: true,
          workEmail: true,
          userId: true,
        },
      });

      if (!manager?.workEmail) {
        this.logger.warn(`Manager ${payload.managerId} has no work email`);
        return;
      }

      const job: EmailDispatchJob = {
        recipientId: manager.userId ?? manager.id,
        recipientEmail: manager.workEmail,
        templateName: 'leave_requested',
        templateData: {
          employeeName: payload.employeeName,
          leaveType: payload.leaveType,
          startDate: payload.startDate,
          endDate: payload.endDate,
        },
        notificationPayload: {
          type: 'LEAVE_REQUESTED',
          title: `${payload.employeeName} requested leave`,
          body: `${payload.leaveType} leave from ${payload.startDate} to ${payload.endDate} awaiting your approval.`,
          metadata: { leaveRequestId: payload.leaveRequestId },
          companyId: payload.companyId,
        },
      };

      await this.emailProcessor.process({ data: job });
    } catch (err) {
      this.logger.error('Failed to handle leave requested notification', err);
    }
  }

  private async handleLeaveDecision(
    payload: LeaveDecisionPayload,
    decision: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    try {
      const employee = await this.prisma.unscopedClient.employee.findUnique({
        where: { id: payload.employeeId },
        select: {
          id: true,
          workEmail: true,
          userId: true,
        },
      });

      if (!employee?.workEmail) {
        this.logger.warn(`Employee ${payload.employeeId} has no work email`);
        return;
      }

      const job: EmailDispatchJob = {
        recipientId: employee.userId ?? employee.id,
        recipientEmail: employee.workEmail,
        templateName: 'leave_approved',
        templateData: {
          leaveType: payload.leaveType,
          startDate: payload.startDate,
          endDate: payload.endDate,
          approverName: payload.approverName,
          decision,
        },
        notificationPayload: {
          type: decision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
          title:
            decision === 'APPROVED'
              ? 'Leave Approved'
              : 'Leave Rejected',
          body:
            decision === 'APPROVED'
              ? `Your ${payload.leaveType} leave from ${payload.startDate} to ${payload.endDate} has been approved by ${payload.approverName}.`
              : `Your ${payload.leaveType} leave from ${payload.startDate} to ${payload.endDate} has been rejected by ${payload.approverName}.`,
          metadata: { leaveRequestId: payload.leaveRequestId },
          companyId: payload.companyId,
        },
      };

      await this.emailProcessor.process({ data: job });
    } catch (err) {
      this.logger.error('Failed to handle leave decision notification', err);
    }
  }

  private async handlePayslipReady(payload: PayslipReadyPayload): Promise<void> {
    try {
      const employee = await this.prisma.unscopedClient.employee.findUnique({
        where: { id: payload.employeeId },
        select: {
          id: true,
          workEmail: true,
          userId: true,
        },
      });

      if (!employee?.workEmail) {
        this.logger.warn(`Employee ${payload.employeeId} has no work email`);
        return;
      }

      const job: EmailDispatchJob = {
        recipientId: employee.userId ?? employee.id,
        recipientEmail: employee.workEmail,
        templateName: 'payslip_ready',
        templateData: { period: payload.period },
        notificationPayload: {
          type: 'PAYSLIP_READY',
          title: 'Payslip Ready',
          body: `Your payslip for ${payload.period} is ready. Login to view.`,
          metadata: { payslipId: payload.payslipId },
          companyId: payload.companyId,
        },
      };

      await this.emailProcessor.process({ data: job });
    } catch (err) {
      this.logger.error('Failed to handle payslip ready notification', err);
    }
  }

  private async handlePolicyPublished(payload: PolicyPublishedPayload): Promise<void> {
    try {
      // Fetch all active employees
      const employees = await this.prisma.unscopedClient.employee.findMany({
        where: {
          companyId: payload.companyId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          workEmail: true,
          userId: true,
        },
      });

      if (employees.length === 0) {
        this.logger.log('No active employees to notify for policy publication');
        return;
      }

      // Process in batches to avoid overwhelming the email service
      const batchSize = 25;
      for (let i = 0; i < employees.length; i += batchSize) {
        const batch = employees.slice(i, i + batchSize);
        const promises = batch.map((emp) => {
          if (!emp.workEmail) return Promise.resolve();

          const job: EmailDispatchJob = {
            recipientId: emp.userId ?? emp.id,
            recipientEmail: emp.workEmail,
            templateName: 'policy_published',
            templateData: {
              policyTitle: payload.policyTitle,
              category: payload.category,
            },
            notificationPayload: {
              type: 'POLICY_PUBLISHED',
              title: `New Policy: ${payload.policyTitle}`,
              body: `A new policy "${payload.policyTitle}" (category: ${payload.category}) has been published. Please review and acknowledge.`,
              metadata: { policyId: payload.policyId },
              companyId: payload.companyId,
            },
          };

          return this.emailProcessor.process({ data: job }).catch((err: Error) =>
            this.logger.error(
              `Failed to send policy notification to ${emp.workEmail}`,
              err,
            ),
          );
        });

        // eslint-disable-next-line no-await-in-loop
        await Promise.all(promises);
      }

      this.logger.log(
        `Policy published notification sent to ${employees.length} employees`,
      );
    } catch (err) {
      this.logger.error('Failed to handle policy published notification', err);
    }
  }

  private async handleEsignRequest(payload: EsignRequestCreatedPayload): Promise<void> {
    try {
      const signer = await this.prisma.unscopedClient.employee.findUnique({
        where: { id: payload.signerEmployeeId },
        select: {
          id: true,
          workEmail: true,
          userId: true,
        },
      });

      if (!signer?.workEmail) {
        this.logger.warn(
          `Signer ${payload.signerEmployeeId} has no work email`,
        );
        return;
      }

      // Resolve document name
      const doc =
        await this.prisma.unscopedClient.employeeDocument.findUnique({
          where: { id: payload.documentId },
          select: { name: true },
        });

      const job: EmailDispatchJob = {
        recipientId: signer.userId ?? signer.id,
        recipientEmail: signer.workEmail,
        templateName: 'esign_request',
        templateData: {
          documentName: doc?.name ?? 'Document',
          expiresAt: payload.expiresAt,
        },
        notificationPayload: {
          type: 'ESIGN_REQUEST',
          title: 'Document Pending Your Signature',
          body: `You have a document pending your signature: ${doc?.name ?? 'Document'}. This request expires on ${payload.expiresAt}.`,
          metadata: { esignRequestId: payload.esignRequestId },
          companyId: payload.companyId,
        },
      };

      await this.emailProcessor.process({ data: job });
    } catch (err) {
      this.logger.error('Failed to handle esign request notification', err);
    }
  }
}

// Payload type definitions
interface LeaveRequestedPayload {
  leaveRequestId: string;
  employeeId: string;
  managerId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  employeeName: string;
  companyId: string;
}

interface LeaveDecisionPayload {
  leaveRequestId: string;
  employeeId: string;
  approverId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  approverName: string;
  decision: string;
  companyId: string;
}

interface PayslipReadyPayload {
  payslipId: string;
  employeeId: string;
  period: string;
  companyId: string;
}

interface PolicyPublishedPayload {
  policyId: string;
  policyTitle: string;
  category: string;
  publishedBy: string;
  companyId: string;
}

interface EsignRequestCreatedPayload {
  esignRequestId: string;
  signerEmployeeId: string;
  documentId: string;
  expiresAt: string;
  companyId: string;
}
