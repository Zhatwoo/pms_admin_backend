import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

import { PmsSaasService } from './pms-saas.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService, PmsSaasService],
  exports: [ClientsService, PmsSaasService],
})
export class ClientsModule {}

