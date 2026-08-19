import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PlansService } from './plans.service';

@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Public()
  @Get()
  getPublicLandingPlans() {
    return this.plansService.getPublicLandingPlans();
  }
}
