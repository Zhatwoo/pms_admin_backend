import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { AdminRole } from '../../../../generated/prisma/enums';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(AdminRole)
  role: AdminRole;
}
