import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateEsignRequestDto {
  @IsUUID()
  documentId!: string;

  @IsUUID()
  signerEmployeeId!: string;
}

export class SignDocumentDto {
  @IsNotEmpty()
  base64Signature!: string;
}

export class DeclineEsignDto {
  @IsOptional()
  reason?: string;
}
