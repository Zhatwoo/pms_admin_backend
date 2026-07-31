import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentAdminUser } from '../auth/decorators/current-admin-user.decorator';
import { AdminUser } from '../../../generated/prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto, @CurrentAdminUser() actor: AdminUser) {
    return this.tenantsService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: QueryTenantDto) {
    return this.tenantsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.tenantsService.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentAdminUser() actor: AdminUser) {
    return this.tenantsService.remove(id, actor);
  }
}
