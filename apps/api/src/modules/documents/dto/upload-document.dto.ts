import { IsIn, IsOptional, MaxLength } from 'class-validator';

const ALLOWED_CATEGORIES = [
  'CONTRACT',
  'NID',
  'CERTIFICATE',
  'PAYSLIP',
  'OTHER',
] as const;

export class UploadDocumentDto {
  @IsIn(ALLOWED_CATEGORIES)
  category!: string;

  @IsOptional()
  @MaxLength(255)
  description?: string;
}
