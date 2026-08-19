import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsString()
  currencySymbol?: string;

  @IsOptional()
  @IsString()
  invoiceHeaderNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultTrialDays?: number;
}
