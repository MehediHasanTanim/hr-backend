import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { QUEUE_NAMES } from '../../../common/queues.constants';
import { ReportQueryService } from '../services/report-query.service';
import { S3Service } from '../../../common/s3/s3.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '@hr/prisma';
import { ExportFormat } from '../enums/export-format.enum';
import type { ReportQueryDto } from '../dto/report-query.dto';

export interface ReportExportJobPayload {
  savedReportId: string;
  format: ExportFormat;
  recipientId?: string;
  triggeredAt: string;
}

@Injectable()
@Processor(QUEUE_NAMES.REPORT_EXPORT)
export class ReportExportProcessor {
  private readonly logger = new Logger(ReportExportProcessor.name);

  constructor(
    @Inject(ReportQueryService) private readonly reportQueryService: ReportQueryService,
    @Inject(S3Service) private readonly s3Service: S3Service,
    @Inject(NotificationsService) private readonly notificationService: NotificationsService,
    @Inject(AuditService) private readonly auditLogService: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Process()
  async handle(job: Job<ReportExportJobPayload>): Promise<void> {
    const { savedReportId, format, recipientId, triggeredAt } = job.data;

    this.logger.log(
      `Processing report export job ${job.id} for savedReport ${savedReportId}`,
    );

    // 1. Load SavedReport
    const savedReport = await this.prisma.unscopedClient.savedReport.findUnique({
      where: { id: savedReportId },
    });

    if (!savedReport) {
      throw new Error(`Saved report ${savedReportId} not found`);
    }

    // 2. Run the report query
    const params = savedReport.parameters as unknown as ReportQueryDto;
    const result = await this.reportQueryService.run({
      reportKey: savedReport.reportKey as ReportQueryDto['reportKey'],
      startDate: params.startDate,
      endDate: params.endDate,
      departmentId: params.departmentId,
      leaveType: params.leaveType,
      payrollPeriod: params.payrollPeriod,
    });

    // 3. Format to buffer
    const buffer = await this.formatReport(result, format);

    // 4. Upload to S3 (store key only, never signed URL)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = format === ExportFormat.XLSX ? 'xlsx' : 'pdf';
    const s3Key = `reports/${savedReportId}/${timestamp}.${ext}`;

    await this.s3Service.putObject({
      Key: s3Key,
      Body: buffer,
      ContentType:
        format === ExportFormat.XLSX
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf',
    });

    // 5. Notify recipient (if provided)
    if (recipientId) {
      try {
        // Look up the companyId from the saved report's creator's employee record
        const creatorEmployee = await this.prisma.unscopedClient.employee.findFirst({
          where: { userId: savedReport.createdById },
          select: { companyId: true },
        });

        await this.notificationService.create({
          userId: recipientId,
          type: 'REPORT_READY' as NotificationType,
          title: 'Your report is ready',
          body: `Report "${savedReport.name}" export is complete.`,
          companyId: creatorEmployee?.companyId ?? '',
        });
      } catch (err) {
        this.logger.error(
          `Failed to send notification for report export ${savedReportId}`,
          err,
        );
        // Do not re-throw — export success should not be blocked by notification failure
      }
    }

    // 6. Audit log (fire-and-forget with PII stripping)
    this.auditLogService.logAsync({
      companyId: '',
      entityType: 'saved_report',
      entityId: savedReportId,
      action: 'REPORT_EXPORT_COMPLETED',
      newValue: this.auditLogService.stripPii({
        savedReportId,
        format,
        s3Key,
        rowCount: result.totalRows,
      }),
    });

    this.logger.log(
      `Report export completed: ${s3Key} (${result.totalRows} rows)`,
    );
  }

  private async formatReport(
    result: { rows: Record<string, unknown>[] },
    format: ExportFormat,
  ): Promise<Buffer> {
    if (format === ExportFormat.XLSX) {
      return this.formatXlsx(result.rows);
    }
    return this.formatPdf(result.rows);
  }

  private async formatXlsx(rows: Record<string, unknown>[]): Promise<Buffer> {
    // Dynamic import of exceljs to avoid bundling issues
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      worksheet.columns = headers.map((h) => ({
        header: h,
        key: h,
        width: 20,
      }));

      // Style header row
      worksheet.getRow(1).font = { bold: true };
    }

    for (const row of rows) {
      worksheet.addRow(row);
    }

    return (await workbook.xlsx.writeBuffer()) as Buffer;
  }

  private async formatPdf(rows: Record<string, unknown>[]): Promise<Buffer> {
    // Use pdfmake (already installed in the project)
    const PdfPrinter = (await import('pdfmake')).default;

    if (rows.length === 0) {
      const docDef = {
        content: [{ text: 'No data', style: 'header' }],
      };
      const printer = new PdfPrinter({
        Roboto: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
        },
      });
      const pdfDoc = printer.createPdfKitDocument(docDef);
      return this.streamToBuffer(pdfDoc);
    }

    const headers = Object.keys(rows[0]);

    const tableBody = [
      headers.map((h) => ({
        text: h,
        style: 'tableHeader',
        bold: true,
      })),
      ...rows.map((row, rowIdx) =>
        headers.map((h) => ({
          text: String(row[h] ?? ''),
          fillColor: rowIdx % 2 === 0 ? '#f5f5f5' : undefined,
        })),
      ),
    ];

    const docDef = {
      pageOrientation: 'landscape' as const,
      pageSize: 'A4' as const,
      content: [
        {
          table: {
            headerRows: 1,
            widths: headers.map(() => '*'),
            body: tableBody,
          },
          layout: 'lightHorizontalLines',
        },
      ],
      styles: {
        tableHeader: {
          fontSize: 8,
          bold: true,
        },
      },
      defaultStyle: {
        fontSize: 8,
      },
    };

    const printer = new PdfPrinter({
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
      },
    });

    const pdfDoc = printer.createPdfKitDocument(docDef);
    return this.streamToBuffer(pdfDoc);
  }

  private streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
