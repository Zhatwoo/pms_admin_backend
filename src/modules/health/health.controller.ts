import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  check() {
    return {
      status: 'ok',
      service: 'pms-admin-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
