import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { CreateClientDto } from './dto/create-client.dto';
import { UpsertClientDto } from './dto/upsert-client.dto';
import { ClientsService } from './clients.service';
import { Post } from '@nestjs/common';

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.clientsService.findAll(search);
  }

  @Post()
  create(
    @Body() dto: CreateClientDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.clientsService.create(dto, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Get(':id/details')
  findDetails(@Param('id') id: string) {
    return this.clientsService.findDetails(id);
  }

  @Put('tenant/:tenantId')
  upsertForTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertClientDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.clientsService.upsertForTenant(tenantId, dto, actor);
  }

  @Post(':id/send-welcome-email')
  sendWelcomeEmail(
    @Param('id') id: string,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.clientsService.sendWelcomeEmail(id, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.clientsService.remove(id, actor);
  }
}
