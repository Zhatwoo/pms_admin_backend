import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateTenantUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;
}
