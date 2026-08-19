import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [AuthModule, ClientsModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
