import { ReportKey } from '../enums/report-key.enum';

export interface ReportResultDto {
  reportKey: ReportKey;
  generatedAt: Date;
  rows: Record<string, unknown>[];
  totalRows: number;
}
