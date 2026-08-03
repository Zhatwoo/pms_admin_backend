import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TenantStatus } from '../../../../generated/prisma/enums';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
