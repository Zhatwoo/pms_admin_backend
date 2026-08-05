import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { BillingCycle, SubscriptionStatus } from '../../../../generated/prisma/client';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
