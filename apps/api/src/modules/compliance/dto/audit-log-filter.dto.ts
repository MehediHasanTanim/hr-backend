import { IsOptional, IsUUID, IsISO8601, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditLogFilterDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  resourceType?: string;

  @IsOptional()
  action?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
