import { Controller, Get } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  getPublicLandingPlans() {
    return this.plansService.getPublicLandingPlans();
  }
}
