import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionStatus } from '../../../../generated/prisma/enums';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
