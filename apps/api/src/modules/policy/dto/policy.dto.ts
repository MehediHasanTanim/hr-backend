import { IsIn, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

const POLICY_CATEGORIES = ['HR', 'IT', 'FINANCE', 'GENERAL'] as const;

export class CreatePolicyDto {
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  content!: string;

  @IsIn(POLICY_CATEGORIES)
  category!: string;
}

export class UpdatePolicyDto {
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  content?: string;

  @IsOptional()
  @IsIn(POLICY_CATEGORIES)
  category?: string;
}

export class AcknowledgePolicyDto {}
