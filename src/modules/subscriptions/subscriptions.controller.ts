import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { CreatePlanDto } from './dto/create-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptionsService.createPlan(dto);
  }

  @Get('plans')
  findAllPlans() {
    return this.subscriptionsService.findAllPlans();
  }

  @Post()
  create(@Body() dto: CreateSubscriptionDto, @CurrentAdminUser() actor: AdminUser) {
    return this.subscriptionsService.createSubscription(dto, actor);
  }

  @Get()
  findAll() {
    return this.subscriptionsService.findAll();
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
}
