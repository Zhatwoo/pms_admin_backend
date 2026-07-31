import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminRole, AdminUserStatus } from '../../../../generated/prisma/enums';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;
}
