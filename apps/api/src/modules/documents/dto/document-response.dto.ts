export class DocumentResponseDto {
  id!: string;
  employeeId!: string;
  category!: string;
  originalName!: string;
  mimeType!: string;
  sizeBytes!: number;
  version!: number;
  sha256Hash!: string;
  description!: string | null;
  uploadedBy!: string | null;
  createdAt!: Date;
}
