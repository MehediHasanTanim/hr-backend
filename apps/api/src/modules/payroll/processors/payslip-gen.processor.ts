import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { PAYSLIP_GEN_QUEUE } from '../constants/queues';

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

      const docDefinition: any = {
        content: [
          { text: 'Payslip', style: 'header' },
          { text: `${monthName} ${year}`, style: 'subheader' },
          { text: '\n' },
          {
            text: [
              { text: 'Employee ID: ', bold: true },
              `${entry.employeeId}\n`,
            ],
          },
          { text: '\n' },
          // Earnings table
          { text: 'Earnings', style: 'sectionHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Component', bold: true },
                  { text: 'Amount', bold: true },
                ],
                ...earnings.map((c) => [
                  c.componentName,
                  Number(c.amount).toFixed(2),
                ]),
                [
                  { text: 'Gross Earnings', bold: true },
                  { text: totalEarnings.toFixed(2), bold: true },
                ],
              ],
            },
          },
          { text: '\n' },
          // Deductions table
          { text: 'Deductions', style: 'sectionHeader' },
          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Component', bold: true },
                  { text: 'Amount', bold: true },
                ],
                ...deductions.map((c) => [
                  c.componentName,
                  Number(c.amount).toFixed(2),
                ]),
                [
                  { text: 'Total Deductions', bold: true },
                  { text: totalDeductions.toFixed(2), bold: true },
                ],
              ],
            },
          },
          { text: '\n' },
          // Summary
          {
            table: {
              widths: ['*', '*', '*'],
              body: [
                [
                  { text: `Working Days: ${entry.workingDays}`, alignment: 'center' },
                  { text: `Present Days: ${entry.presentDays}`, alignment: 'center' },
                  { text: `LOP Days: ${entry.lopDays}`, alignment: 'center' },
                ],
              ],
            },
          },
          { text: '\n' },
          {
            text: `Net Payable: ${Number(entry.netPayable).toFixed(2)}`,
            style: 'netPayable',
          },
          { text: '\n\n' },
          { text: 'This is a system-generated payslip', style: 'footer' },
        ],
        styles: {
          header: { fontSize: 16, bold: true, alignment: 'center' },
          subheader: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 10] },
          sectionHeader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
          netPayable: { fontSize: 16, bold: true, alignment: 'center' },
          footer: { fontSize: 8, italics: true, alignment: 'center', color: 'gray' },
        },
        defaultStyle: { fontSize: 10 },
      };

      // 3. Generate PDF buffer using pdfmake
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PdfPrinter = require('pdfmake');
      const fonts = {
        Roboto: {
          normal: `${__dirname}/../fonts/Roboto-Regular.ttf`,
          bold: `${__dirname}/../fonts/Roboto-Medium.ttf`,
          italics: `${__dirname}/../fonts/Roboto-Italic.ttf`,
        },
      };
      const printer = new PdfPrinter(fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
      });

      // 4. Upload to S3 (placeholder — will use S3Service when available)
      const key = `payslips/${entry.cycle.companyId}/${year}/${month}/${employeeId}_${cycleId}.pdf`;
      // await s3Service.upload(key, buffer, 'application/pdf');

      // 5. Save PayslipEntity
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
