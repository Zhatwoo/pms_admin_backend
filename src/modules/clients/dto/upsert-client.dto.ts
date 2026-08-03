import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertClientDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

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
  billingAddress?: string;
}
