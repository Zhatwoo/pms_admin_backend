import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { UpsertClientDto } from './dto/upsert-client.dto';
import { ClientsService } from './clients.service';

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Put('tenant/:tenantId')
  upsertForTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertClientDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.clientsService.upsertForTenant(tenantId, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.clientsService.remove(id, actor);
  }
}
