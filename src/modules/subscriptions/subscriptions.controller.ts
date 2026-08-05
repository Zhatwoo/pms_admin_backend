import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly plansService: PlansService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // --- Plans Management ---

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto, @CurrentAdminUser() actor: AdminUser) {
    return this.plansService.createPlan(dto, actor);
  }

  @Get('plans')
  findAllPlans(@Query('includeArchived') includeArchived?: string) {
    return this.plansService.findAllPlans(includeArchived === 'true');
  }

  @Get('plans/:id')
  findPlanById(@Param('id') id: string) {
    return this.plansService.findPlanById(id);
  }

  @Put('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.plansService.updatePlan(id, dto, actor);
  }

  @Delete('plans/:id')
  removePlan(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.plansService.removePlan(id, actor);
  }

  // --- Analytics Summary ---

  @Get('analytics/summary')
  getSummary() {
    return this.subscriptionsService.getSummary();
  }

  // --- Subscriptions Tracking & Actions ---

  @Post()
  create(@Body() dto: CreateSubscriptionDto, @CurrentAdminUser() actor: AdminUser) {
    return this.subscriptionsService.createSubscription(dto, actor);
  }

  @Get()
  findAll(@Query() query: QuerySubscriptionDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.subscriptionsService.update(id, dto, actor);
  }

  @Post(':id/change-plan')
  changePlan(
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.subscriptionsService.changePlan(id, dto, actor);
  }

  @Post(':id/renew')
  renew(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.subscriptionsService.renew(id, actor);
  }

  @Post(':id/suspend')
  suspend(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.subscriptionsService.suspend(id, actor);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.subscriptionsService.cancel(id, actor);
  }
}
