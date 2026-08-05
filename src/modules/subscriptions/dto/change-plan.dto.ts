import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BillingCycle } from '../../../../generated/prisma/client';

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  newPlanId: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsString()
  notes?: string;
}
