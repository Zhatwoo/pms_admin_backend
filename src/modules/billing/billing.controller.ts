import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  getSummary() {
    return this.billingService.getSummary();
  }

  @Get('invoices')
  findAll(@Query() query: PaginationDto) {
    return this.billingService.findAll(query);
  }

  @Post('invoices/generate')
  generate(@CurrentAdminUser() actor: AdminUser) {
    return this.billingService.generateForActiveSubscriptions(actor);
  }

  @Patch('invoices/:id/mark-paid')
  markPaid(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.billingService.markPaid(id, actor);
  }
}
