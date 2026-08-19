import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsOptional()
  @IsString()
  subdomain?: string;

  @IsOptional()
  @IsBoolean()
  noDomain?: boolean;

  @IsString()
  @IsNotEmpty()
  contactName: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  telephoneNumber?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  planId?: string;
}
