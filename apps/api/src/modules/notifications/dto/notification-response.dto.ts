export class NotificationResponseDto {
  id!: string;
  type!: string;
  title!: string;
  body!: string;
  metadata!: Record<string, unknown> | null;
  isRead!: boolean;
  createdAt!: Date;
}
