import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { PAYSLIP_GEN_QUEUE } from '../constants/queues';
import { StorageService } from '../services/storage.service';

interface PayslipGenJobData {
  entryId: string;
  cycleId: string;
  employeeId: string;
}

@Processor(PAYSLIP_GEN_QUEUE)
export class PayslipGenProcessor extends WorkerHost {
  private readonly logger = new Logger(PayslipGenProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<PayslipGenJobData>): Promise<void> {
    const { entryId, cycleId, employeeId } = job.data;
    this.logger.log({ entryId, cycleId, employeeId }, 'Generating payslip');

    try {
      // 1. Load entry with components, cycle, employee
      const entry = await this.prisma.unscopedClient.payrollEntry.findUnique({
        where: { id: entryId },
        include: {
          components: true,
          cycle: true,
          employee: {
            include: {
              bankDetails: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      });

      if (!entry) {
        this.logger.warn({ entryId }, 'Payroll entry not found, skipping');
        return;
      }

      // 2. Build pdfmake document definition
      const month = entry.cycle.month;
      const year = entry.cycle.year;
      const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

      const earnings = entry.components.filter((c) => c.type === 'EARNING');
      const deductions = entry.components.filter((c) => c.type === 'DEDUCTION');
      const totalEarnings = earnings.reduce((s, c) => s + Number(c.amount), 0);
      const totalDeductions = deductions.reduce((s, c) => s + Number(c.amount), 0);
      const bank = entry.employee.bankDetails[0];

      const docDefinition: any = {
        content: [
          // Company Header
          { text: 'PAYSLIP', style: 'companyHeader' },
          { text: `${monthName} ${year}`, style: 'periodHeader' },
          { text: '\n' },
          // Employee Info
          {
            table: {
              widths: ['50%', '50%'],
              body: [
                [
                  { text: [{ text: 'Employee ID: ', bold: true }, `${employeeId}`], alignment: 'left' },
                  { text: [{ text: 'Status: ', bold: true }, 'Active'], alignment: 'right' },
                ],
                [
                  { text: [{ text: 'Working Days: ', bold: true }, `${entry.workingDays}`], alignment: 'left' },
                  { text: [{ text: 'Pay Days: ', bold: true }, `${entry.presentDays}`], alignment: 'right' },
                ],
                [
                  { text: [{ text: 'LOP Days: ', bold: true }, `${entry.lopDays}`], alignment: 'left' },
                  { text: '', alignment: 'right' },
                ],
              ],
            },
            layout: 'noBorders',
          },
          { text: '\n' },
          // Salary Breakdown
          { text: 'EARNINGS', style: 'sectionHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Component', style: 'tableHeader' },
                  { text: 'Amount (₹)', style: 'tableHeader' },
                ],
                ...earnings.map((c) => [
                  c.componentName,
                  Number(c.amount).toFixed(2),
                ]),
                [
                  { text: 'Gross Earnings', style: 'totalRow' },
                  { text: totalEarnings.toFixed(2), style: 'totalRow' },
                ],
              ],
            },
          },
          { text: '\n' },
          { text: 'DEDUCTIONS', style: 'sectionHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Component', style: 'tableHeader' },
                  { text: 'Amount (₹)', style: 'tableHeader' },
                ],
                ...deductions.map((c) => [
                  c.componentName,
                  Number(c.amount).toFixed(2),
                ]),
                [
                  { text: 'Total Deductions', style: 'totalRow' },
                  { text: totalDeductions.toFixed(2), style: 'totalRow' },
                ],
              ],
            },
          },
          { text: '\n' },
          // Net Payable
          {
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Net Payable', style: 'netPayableLabel' },
                  { text: `₹ ${Number(entry.netPayable).toFixed(2)}`, style: 'netPayableAmount' },
                ],
              ],
            },
          },
          { text: '\n\n' },
          // Payment Details
          ...(bank
            ? [
                { text: 'PAYMENT DETAILS', style: 'sectionHeader' },
                {
                  table: {
                    widths: ['30%', '70%'],
                    body: [
                      [{ text: 'Bank Name', bold: true }, bank.bankName],
                      [{ text: 'Account Name', bold: true }, bank.accountHolderName],
                      [{ text: 'Account Number', bold: true }, bank.accountNumber.slice(-4).padStart(bank.accountNumber.length, '●')],
                      [{ text: 'IFSC Code', bold: true }, bank.ifscCode],
                    ],
                  },
                  layout: 'noBorders',
                },
                { text: '\n' },
              ]
            : []),
          // Footer
          { text: 'This is a computer-generated payslip and does not require a signature.', style: 'footer' },
          { text: `Generated on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, style: 'footer' },
        ],
        styles: {
          companyHeader: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
          periodHeader: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 10], color: '#555' },
          sectionHeader: { fontSize: 11, bold: true, margin: [0, 10, 0, 5], color: '#333' },
          tableHeader: { bold: true, fillColor: '#f0f0f0', margin: [4, 4, 4, 4] },
          totalRow: { bold: true, margin: [4, 4, 4, 4] },
          netPayableLabel: { fontSize: 14, bold: true, margin: [4, 8, 4, 8] },
          netPayableAmount: { fontSize: 14, bold: true, alignment: 'right', margin: [4, 8, 4, 8], color: '#2e7d32' },
          footer: { fontSize: 8, italics: true, alignment: 'center', color: '#999', margin: [0, 2, 0, 2] },
        },
        defaultStyle: { fontSize: 10 },
        pageMargins: [40, 40, 40, 40],
      };

      // 3. Generate PDF buffer using pdfmake
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfmake = require('pdfmake');
      const fonts: Record<string, any> = {};
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        const fontDir = `${__dirname}/../fonts`;
        if (fs.existsSync(`${fontDir}/Roboto-Regular.ttf`)) {
          fonts.Roboto = {
            normal: `${fontDir}/Roboto-Regular.ttf`,
            bold: `${fontDir}/Roboto-Medium.ttf`,
            italics: `${fontDir}/Roboto-Italic.ttf`,
          };
          pdfmake.addFonts(fonts);
        } else {
          this.logger.warn('Roboto fonts not found in fonts directory');
        }
      } catch {
        this.logger.warn('Font detection failed, proceeding without custom fonts');
      }

      const pdfDoc = pdfmake.createPdf(docDefinition);
      const stream = pdfDoc.getStream();

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });

      // 4. Upload to S3
      const key = `payslips/${entry.cycle.companyId}/${year}/${month}/${employeeId}_${cycleId}.pdf`;
      try {
        await this.storage.upload(key, buffer, 'application/pdf');
      } catch (storageErr) {
        this.logger.warn({ key, error: (storageErr as Error).message }, 'S3 upload failed, saving payslip without S3');
      }

      // 5. Save Payslip record
      await this.prisma.unscopedClient.payslip.create({
        data: {
          companyId: entry.cycle.companyId,
          employeeId,
          cycleId,
          entryId,
          grossAmount: totalEarnings,
          netAmount: Number(entry.netPayable),
          taxAmount: 0,
          status: 'PUBLISHED',
          s3Key: key,
          s3Bucket: this.storage['bucket'] ?? 'hr-uploads',
          generatedAt: new Date(),
        },
      });

      // 6. Update PayrollEntry
      await this.prisma.unscopedClient.payrollEntry.update({
        where: { id: entryId },
        data: {
          payslipKey: key,
          payslipGeneratedAt: new Date(),
        },
      });

      this.logger.log({ entryId, key }, 'Payslip generated successfully');
    } catch (err) {
      this.logger.error({ entryId, error: (err as Error).message }, 'Payslip generation failed');

      // Mark generation failed
      await this.prisma.unscopedClient.payrollEntry.update({
        where: { id: entryId },
        data: { payslipGenFailed: true },
      }).catch((e) => {
        this.logger.error({ entryId, error: e.message }, 'Failed to mark payslip gen failed');
      });

      throw err; // Let BullMQ retry
    }
  }
}
