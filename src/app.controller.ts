import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      service: 'pms-admin-backend',
      version: '1.0.0',
    };
  }
}
