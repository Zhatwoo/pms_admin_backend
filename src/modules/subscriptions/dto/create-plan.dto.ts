import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  priceMonthly: number;
}
