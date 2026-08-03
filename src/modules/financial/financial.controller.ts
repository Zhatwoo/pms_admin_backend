import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FinancialService } from './financial.service';

@Controller('financial')
@UseGuards(AuthGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('revenue-report')
  getRevenueReport() {
    return this.financialService.getRevenueReport();
  }
}
