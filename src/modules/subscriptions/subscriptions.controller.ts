import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Roles } from '../../common/decorators';
import { Role } from '../../common/enums';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /** List all subscription plans. */
  @Get('plans')
  findAllPlans() {
    return this.subscriptionsService.findAllPlans();
  }

  /** List all tenant subscriptions. */
  @Get()
  findAllSubscriptions() {
    return this.subscriptionsService.findAllSubscriptions();
  }

  /** Get a specific tenant subscription. */
  @Get(':tenantId')
  findSubscriptionByTenant(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.findByTenant(tenantId);
  }

  /** Create a new subscription plan. */
  @Roles(Role.SUPER_ADMIN)
  @Post('plans')
  createPlan(
    @Body()
    body: {
      name: string;
      priceMonthly: number;
      maxBranches: number;
      maxUsers: number;
    },
  ) {
    return this.subscriptionsService.createPlan(body);
  }

  /** Assign a plan to a tenant. */
  @Roles(Role.SUPER_ADMIN)
  @Post(':tenantId/assign')
  assignPlan(
    @Param('tenantId') tenantId: string,
    @Body() body: { planId: string; status?: string },
  ) {
    return this.subscriptionsService.assignPlanToTenant(
      tenantId,
      body.planId,
      body.status,
    );
  }

  /** Update a tenant subscription status. */
  @Roles(Role.SUPER_ADMIN)
  @Patch(':tenantId')
  updateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { status?: string; planId?: string },
  ) {
    return this.subscriptionsService.updateSubscription(tenantId, body);
  }

  /** Delete a subscription plan. */
  @Roles(Role.SUPER_ADMIN)
  @Delete('plans/:id')
  removePlan(@Param('id') id: string) {
    return this.subscriptionsService.removePlan(id);
  }
}
