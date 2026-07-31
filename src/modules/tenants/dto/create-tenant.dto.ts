import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message:
      'subdomain must be lowercase alphanumeric, optionally hyphenated',
  })
  subdomain: string;
}
