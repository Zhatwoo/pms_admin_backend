import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsController } from './subscriptions.controller';
import { PublicPlansController } from './public-plans.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from './plans.service';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionsController, PublicPlansController],
  providers: [SubscriptionsService, PlansService],
  exports: [SubscriptionsService, PlansService],
})
export class SubscriptionsModule {}
