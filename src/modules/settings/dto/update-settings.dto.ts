import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  platformName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsBoolean()
  enforce2FA?: boolean;

  @IsOptional()
  @IsIn(['us-east-1', 'us-west-2', 'eu-frankfurt-1'])
  dataResidency?: string;
}
