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
import { CreateBranchDto } from './dto/create-branch.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
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

  // --- Branch Endpoints ---
  @Get(':id/branches')
  findBranches(@Param('id') id: string) {
    return this.tenantsService.findBranches(id);
  }

  @Post(':id/branches')
  addBranch(
    @Param('id') id: string,
    @Body() dto: CreateBranchDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.tenantsService.addBranch(id, dto, actor);
  }

  @Delete(':id/branches/:branchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.tenantsService.removeBranch(id, branchId, actor);
  }

  // --- Tenant Users Endpoints ---
  @Get(':id/users')
  findUsers(@Param('id') id: string) {
    return this.tenantsService.findUsers(id);
  }

  @Post(':id/users')
  addUser(
    @Param('id') id: string,
    @Body() dto: CreateTenantUserDto,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.tenantsService.addUser(id, dto, actor);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentAdminUser() actor: AdminUser,
  ) {
    return this.tenantsService.removeUser(id, userId, actor);
  }

  // --- Customers & Transactions Endpoints ---
  @Get(':id/customers')
  findCustomers(@Param('id') id: string) {
    return this.tenantsService.findCustomers(id);
  }

  @Get(':id/transactions')
  findTransactions(@Param('id') id: string) {
    return this.tenantsService.findTransactions(id);
  }
}
